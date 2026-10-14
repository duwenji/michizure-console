pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        // core-format from yorisoi-platform, SanpoGuide's prompt pack from yorisoi-sanpoguide.
        // Both are public repositories. Reading GitHub Packages needs a token with read:packages: $GITHUB_TOKEN in CI,
        // or gpr.user / gpr.key in ~/.gradle/gradle.properties. Without one, only locally published
        // ones are used (asking without a token fails).
        val gprUser = providers.gradleProperty("gpr.user").orElse(providers.environmentVariable("GITHUB_ACTOR")).orNull
        val gprKey = providers.gradleProperty("gpr.key").orElse(providers.environmentVariable("GITHUB_TOKEN")).orNull
        if (gprUser != null && gprKey != null) {
            maven {
                name = "yorisoiPlatform"
                url = uri("https://maven.pkg.github.com/duwenji/yorisoi-platform")
                credentials {
                    username = gprUser
                    password = gprKey
                }
                content { includeGroup("io.github.duwenji.yorisoi") }
            }
            maven {
                name = "yorisoiSanpoguide"
                url = uri("https://maven.pkg.github.com/duwenji/yorisoi-sanpoguide")
                credentials {
                    username = gprUser
                    password = gprKey
                }
                content { includeGroup("io.github.duwenji.yorisoi.sanpoguide") }
            }
        }
        // Built locally (`./gradlew publishToMavenLocal` in yorisoi-platform and yorisoi-sanpoguide).
        mavenLocal {
            content {
                includeGroup("io.github.duwenji.yorisoi")
                includeGroup("io.github.duwenji.yorisoi.sanpoguide")
            }
        }
    }
}

rootProject.name = "validator"
