plugins {
    java
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

group = "io.aitop"
version = "0.1.0-SNAPSHOT"

java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}

repositories {
    mavenCentral()
}

dependencies {
    // OpenTelemetry Java Agent for auto-instrumentation
    implementation("io.opentelemetry.javaagent:opentelemetry-javaagent:1.32.0")
    implementation("io.opentelemetry:opentelemetry-api:1.32.0")

    // ByteBuddy for bytecode manipulation
    implementation("net.bytebuddy:byte-buddy:1.14.12")
    implementation("net.bytebuddy:byte-buddy-agent:1.14.12")

    // Testing
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.1")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.shadowJar {
    archiveClassifier.set("all")

    manifest {
        attributes(
            "Premain-Class" to "io.aitop.agent.AitopAgent",
            "Can-Redefine-Classes" to "true",
            "Can-Retransform-Classes" to "true",
            "Implementation-Title" to "AITOP Java Agent",
            "Implementation-Version" to project.version,
        )
    }

    // Relocate ByteBuddy to avoid conflicts with application dependencies
    relocate("net.bytebuddy", "io.aitop.agent.shaded.bytebuddy")
}

tasks.test {
    useJUnitPlatform()
}
