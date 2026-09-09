plugins {
    id("com.android.application") version "8.12.0"
    id("org.jetbrains.kotlin.android") version "2.1.10"
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.10"
}

android {
    namespace = "com.teamspaceone.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.teamspaceone.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "API_BASE_URL", "\"http://localhost:3000\"")
        buildConfigField("String", "REALTIME_URL", "\"http://localhost:3005\"")
        buildConfigField("String", "SFU_URL", "\"ws://127.0.0.1:8443\"")
        buildConfigField("String", "STUN_URL", "\"stun:stun.l.google.com:19302\"")
        buildConfigField("String", "TURN_URL", "\"\"")
        buildConfigField("String", "TURN_USERNAME", "\"\"")
        buildConfigField("String", "TURN_PASSWORD", "\"\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = "androidx.compose:compose-bom:2024.09.00"
    implementation(platform(composeBom))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.5")
    implementation("androidx.security:security-crypto:1.0.0")
    implementation("io.ktor:ktor-client-android:2.3.12")
    implementation("io.ktor:ktor-client-auth:2.3.12")
    implementation("io.ktor:ktor-client-content-negotiation:2.3.12")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.12")
    implementation("io.ktor:ktor-client-logging:2.3.12")
    implementation("io.ktor:ktor-client-websockets:2.3.12")
    implementation("io.socket:socket.io-client:2.1.0")
    implementation("ch.threema:webrtc-android:144.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
