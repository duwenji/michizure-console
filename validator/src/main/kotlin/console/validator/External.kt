package console.validator

import java.io.IOException
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI
import java.net.UnknownHostException
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.MessageDigest
import java.time.Duration

/** What reading one outside resource found (DES-007 J-5). */
sealed interface Fetched {
    data class Ok(val size: Long, val sha256: String) : Fetched

    /** Not fetched on purpose: not HTTPS, an address inside, or a redirect (J-6). */
    data class Refused(val detail: String) : Fetched

    /** Fetched but unusable, or not reachable: an HTTP error, too large, too slow. */
    data class Failed(val detail: String) : Fetched
}

/** Reads an outside resource to check its size and hash, without keeping it. */
fun interface ExternalFetcher {
    fun fetch(url: String, maxBytes: Long): Fetched
}

/**
 * Which addresses the machine review may fetch from (DES-007 J-6): public unicast only. The daily
 * check has the same rule in TypeScript (api/src/publish/external.ts, DES-009 M-8): change both. Loopback,
 * private, link-local (the instance metadata range), carrier-grade NAT, multicast and the other
 * special-purpose blocks are refused, so a producer's URL can't make the console read its own side.
 */
object AddressGuard {
    fun isPublic(address: InetAddress): Boolean {
        if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress ||
            address.isSiteLocalAddress || address.isMulticastAddress
        ) return false
        val b = address.address.map { it.toInt() and 0xff }
        return when (address) {
            is Inet4Address -> !(
                b[0] == 0 || // "this network"
                    (b[0] == 100 && b[1] in 64..127) || // carrier-grade NAT
                    (b[0] == 192 && b[1] == 0 && b[2] == 0) || // IETF protocol assignments
                    (b[0] == 192 && b[1] == 0 && b[2] == 2) || (b[0] == 198 && b[1] == 51 && b[2] == 100) || (b[0] == 203 && b[1] == 0 && b[2] == 113) || // documentation
                    (b[0] == 198 && b[1] in 18..19) || // benchmarking
                    b[0] >= 240 // reserved and broadcast
                )
            is Inet6Address -> !(
                (b[0] and 0xfe) == 0xfc || // unique local
                    (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0d && b[3] == 0xb8) || // documentation
                    (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xff && b[3] == 0x9b) // NAT64: an IPv4 address inside
                )
            else -> false
        }
    }
}

/**
 * Fetches over HTTPS with the guard above, no redirects, and limits on size and time (DES-007
 * J-5・J-6). The body is hashed as it streams and never stored. The Lambda runs outside a VPC and
 * this sends no AWS credentials. A name that resolves differently between the check and the
 * connection (DNS rebinding) could still reach an inside address; outside a VPC the Lambda has
 * nothing there to read but the runtime API on loopback, which the guard's own resolution refuses.
 *
 * [requireHttps] and [allowed] exist for tests against a local server.
 */
class HttpsFetcher(
    private val timeout: Duration = Duration.ofSeconds(60),
    private val requireHttps: Boolean = true,
    private val allowed: (InetAddress) -> Boolean = AddressGuard::isPublic,
    private val resolve: (String) -> List<InetAddress> = { host -> InetAddress.getAllByName(host).toList() },
) : ExternalFetcher {
    private val client = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NEVER)
        .connectTimeout(Duration.ofSeconds(10))
        .build()

    override fun fetch(url: String, maxBytes: Long): Fetched {
        val uri = try {
            URI(url)
        } catch (e: Exception) {
            return Fetched.Refused("not a URL")
        }
        if (requireHttps && uri.scheme != "https") return Fetched.Refused("not HTTPS")
        if (uri.userInfo != null) return Fetched.Refused("credentials in the URL")
        val host = uri.host ?: return Fetched.Refused("no host")
        val addresses = try {
            resolve(host)
        } catch (e: UnknownHostException) {
            return Fetched.Failed("unknown host $host")
        }
        if (addresses.isEmpty() || !addresses.all(allowed)) return Fetched.Refused("$host is not a public address")

        val request = HttpRequest.newBuilder(uri).timeout(timeout).header("User-Agent", "michizure-console machine review").GET().build()
        return try {
            val response = client.send(request, HttpResponse.BodyHandlers.ofInputStream())
            response.body().use { body ->
                when (response.statusCode()) {
                    in 300..399 -> return Fetched.Refused("redirect (HTTP ${response.statusCode()}) not followed")
                    200 -> Unit
                    else -> return Fetched.Failed("HTTP ${response.statusCode()}")
                }
                val digest = MessageDigest.getInstance("SHA-256")
                val buffer = ByteArray(64 * 1024)
                var total = 0L
                while (true) {
                    val n = body.read(buffer)
                    if (n < 0) break
                    total += n
                    if (total > maxBytes) return Fetched.Failed("larger than $maxBytes bytes")
                    digest.update(buffer, 0, n)
                }
                Fetched.Ok(total, digest.digest().joinToString("") { "%02x".format(it) })
            }
        } catch (e: java.net.http.HttpTimeoutException) {
            Fetched.Failed("timed out")
        } catch (e: IOException) {
            Fetched.Failed("could not read: ${e.message}")
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            Fetched.Failed("interrupted")
        }
    }
}
