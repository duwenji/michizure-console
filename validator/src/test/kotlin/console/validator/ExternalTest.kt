package console.validator

import com.sun.net.httpserver.HttpServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress
import java.net.InetSocketAddress
import java.security.MessageDigest
import java.time.Duration

/** DES-007 J-5・J-6: reading outside resources, and the addresses that are never read. */
class ExternalTest {
    private val body = ByteArray(5000) { (it % 251).toByte() }
    private val server = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0).apply {
        createContext("/ok") { it.sendResponseHeaders(200, body.size.toLong()); it.responseBody.use { out -> out.write(body) } }
        createContext("/moved") { it.responseHeaders.add("Location", "http://169.254.169.254/latest/meta-data/"); it.sendResponseHeaders(302, -1); it.close() }
        createContext("/missing") { it.sendResponseHeaders(404, -1); it.close() }
        createContext("/slow") { Thread.sleep(3000); it.sendResponseHeaders(200, body.size.toLong()); it.responseBody.use { out -> out.write(body) } }
        // A slow answer mustn't hold up the others.
        executor = java.util.concurrent.Executors.newCachedThreadPool()
        start()
    }
    private val base = "http://127.0.0.1:${server.address.port}"

    /** Only for these tests: plain HTTP on loopback, which the real fetcher never allows. */
    private val local = HttpsFetcher(timeout = Duration.ofSeconds(1), requireHttps = false, allowed = { true })

    @After
    fun stop() = server.stop(0)

    @Test
    fun `a resource is hashed as it streams`() {
        val got = local.fetch("$base/ok", 10_000)
        val sha = MessageDigest.getInstance("SHA-256").digest(body).joinToString("") { "%02x".format(it) }
        assertEquals(Fetched.Ok(5000, sha), got)
    }

    @Test
    fun `too large, missing, slow and redirected resources aren't accepted`() {
        assertEquals(Fetched.Failed("larger than 4096 bytes"), local.fetch("$base/ok", 4096))
        assertEquals(Fetched.Failed("HTTP 404"), local.fetch("$base/missing", 10_000))
        assertEquals(Fetched.Failed("timed out"), local.fetch("$base/slow", 10_000))
        assertTrue(local.fetch("$base/moved", 10_000) is Fetched.Refused)
    }

    @Test
    fun `the real fetcher reads only HTTPS from public addresses`() {
        val fetcher = HttpsFetcher()
        assertEquals(Fetched.Refused("not HTTPS"), fetcher.fetch("$base/ok", 10_000))
        assertTrue(fetcher.fetch("https://127.0.0.1:${server.address.port}/ok", 10_000) is Fetched.Refused)
        assertTrue(fetcher.fetch("https://user:pass@example.com/x", 10) is Fetched.Refused)
        // A name that resolves inside is refused before connecting.
        val inside = HttpsFetcher(resolve = { listOf(InetAddress.getByName("10.0.0.5")) })
        assertEquals(Fetched.Refused("cdn.example.com is not a public address"), inside.fetch("https://cdn.example.com/n.ogg", 10))
    }

    @Test
    fun `the guard refuses every inside and special address`() {
        val refused = listOf(
            "127.0.0.1", "0.0.0.0", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1",
            "192.0.0.8", "198.18.0.1", "224.0.0.1", "255.255.255.255", "::1", "fe80::1", "fd00::1", "ff02::1",
            "::ffff:10.0.0.1", "64:ff9b::a00:1", "2001:db8::1",
        )
        refused.forEach { assertFalse(it, AddressGuard.isPublic(InetAddress.getByName(it))) }
        listOf("93.184.216.34", "8.8.8.8", "2606:4700::1111").forEach { assertTrue(it, AddressGuard.isPublic(InetAddress.getByName(it))) }
    }
}
