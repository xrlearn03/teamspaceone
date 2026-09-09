package com.teamspaceone.mobile.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.viewinterop.AndroidView
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
import com.teamspaceone.mobile.ui.components.ParticipantGrid

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
    val isCameraOn by WebRTCManager.isCameraOn.collectAsState()
    val localVideoTrack by WebRTCManager.localVideoTrack.collectAsState()
    val remoteParticipants by WebRTCManager.remoteParticipants.collectAsState()
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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = { WebRTCManager.setMicEnabled(!isMicEnabled) },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (isMicEnabled) "Mute" else "Unmute")
                }

                Button(
                    onClick = { WebRTCManager.setSpeakerOn(!isSpeakerOn) },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (isSpeakerOn) "Earpiece" else "Speaker")
                }

                Button(
                    onClick = { WebRTCManager.setCameraEnabled(!isCameraOn) },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (isCameraOn) "Cam Off" else "Cam On")
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                ParticipantGrid(
                    participants = remoteParticipants,
                    modifier = Modifier.fillMaxSize()
                )

                localVideoTrack?.let { track ->
                    AndroidView(
                        factory = { ctx ->
                            org.webrtc.SurfaceViewRenderer(ctx).apply {
                                init(WebRTCManager.eglBase?.eglBaseContext, null)
                                setMirror(true)
                            }
                        },
                        update = { renderer ->
                            track.removeSink(renderer)
                            track.addSink(renderer)
                        },
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(8.dp)
                            .size(width = 120.dp, height = 90.dp)
                    )
                }
            }
        }

        Text(if (isConnected) "Connected (${participants.size})" else "Disconnected")

        errorMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error)
        }

        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }
    }
}
