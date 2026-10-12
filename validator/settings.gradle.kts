pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        // core-format and SanpoGuide's prompt pack, published by SanpoGuide (ADR-001 T-4, SanpoGuide
        // RFC-002 R-11). Reading GitHub Packages needs a token with read:packages: $GITHUB_TOKEN in CI,
        // or gpr.user / gpr.key in ~/.gradle/gradle.properties. Without one, only locally published
        // ones are used (asking without a token fails).
        val gprUser = providers.gradleProperty("gpr.user").orElse(providers.environmentVariable("GITHUB_ACTOR")).orNull
        val gprKey = providers.gradleProperty("gpr.key").orElse(providers.environmentVariable("GITHUB_TOKEN")).orNull
        if (gprUser != null && gprKey != null) {
            maven {
                name = "SanpoGuide"
                url = uri("https://maven.pkg.github.com/duwenji/SanpoGuide")
                credentials {
                    username = gprUser
                    password = gprKey
                }
                content {
                    includeGroup("io.github.duwenji.michizure")
                    includeGroup("io.github.duwenji.sanpoguide")
                }
            }
        }
        // Built locally (`./gradlew publishToMavenLocal` in SanpoGuide).
        mavenLocal {
            content {
                includeGroup("io.github.duwenji.michizure")
                includeGroup("io.github.duwenji.sanpoguide")
            }
        }
    }
}

rootProject.name = "validator"
