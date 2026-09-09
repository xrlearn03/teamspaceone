package com.teamspaceone.mobile.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.teamspaceone.mobile.data.webrtc.WebRTCManager

@Composable
fun MeetingScreen(onBack: () -> Unit = {}) {
    val context = LocalContext.current
    var roomId by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    val isConnected by WebRTCManager.isConnected.collectAsState()
    val isMicEnabled by WebRTCManager.isMicEnabled.collectAsState()
    val errorMessage by WebRTCManager.errorMessage.collectAsState()
    val participants by WebRTCManager.participants.collectAsState()
    val isSpeakerOn by WebRTCManager.isSpeakerOn.collectAsState()
    val permissions = remember { arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA) }
    var permissionsGranted by remember {
        mutableStateOf(permissions.all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        })
    }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        permissionsGranted = result.values.all { it }
    }

    LaunchedEffect(Unit) {
        if (!permissionsGranted) launcher.launch(permissions)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Meeting", style = MaterialTheme.typography.headlineMedium)

        OutlinedTextField(
            value = roomId,
            onValueChange = { roomId = it },
            label = { Text("Room ID") },
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = displayName,
            onValueChange = { displayName = it },
            label = { Text("Display name") },
            modifier = Modifier.fillMaxWidth()
        )

        if (!permissionsGranted) {
            Text("Microphone and camera permissions are required for calls.", style = MaterialTheme.typography.bodySmall)
        }

        Button(
            onClick = {
                if (!permissionsGranted) {
                    launcher.launch(permissions)
                    return@Button
                }
                if (isConnected) {
                    WebRTCManager.stop()
                } else {
                    val name = displayName.trim().ifBlank { "Android User" }
                    WebRTCManager.connect(roomId.trim(), name, null)
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = (roomId.trim().isNotBlank() && permissionsGranted) || isConnected
        ) {
            Text(if (isConnected) "Disconnect" else "Connect")
        }

        if (isConnected) {
            Button(
                onClick = { WebRTCManager.setMicEnabled(!isMicEnabled) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (isMicEnabled) "Mute" else "Unmute")
            }

            Button(
                onClick = { WebRTCManager.setSpeakerOn(!isSpeakerOn) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (isSpeakerOn) "Earpiece" else "Speaker")
            }
        }

        Text(if (isConnected) "Connected" else "Disconnected")

        errorMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error)
        }

        Text("Participants: ${participants.size}")
        participants.forEach { participant ->
            Text(participant.displayName)
        }

        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }
    }
}
