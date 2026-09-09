package com.teamspaceone.mobile.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.teamspaceone.mobile.data.realtime.RealtimeManager
import com.teamspaceone.mobile.data.remote.AuthManager
import com.teamspaceone.mobile.data.remote.Channel
import com.teamspaceone.mobile.data.remote.FileRepository
import com.teamspaceone.mobile.data.remote.Message
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

@Composable
fun ChannelDetailScreen(channel: Channel, onBack: () -> Unit = {}) {
    val context = LocalContext.current
    var isLoading by remember { mutableStateOf(true) }
    var messages by remember { mutableStateOf<List<Message>>(emptyList()) }
    var input by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("") }
    var pendingAttachmentIds by remember { mutableStateOf<List<String>>(emptyList()) }
    val scope = rememberCoroutineScope()

    val fileLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            status = "Uploading attachment…"
            try {
                val file = FileRepository.uploadFile(context, uri)
                pendingAttachmentIds = pendingAttachmentIds + file.id
                status = ""
            } catch (e: Exception) {
                status = "Attachment upload failed: ${e.message}"
            }
        }
    }

    LaunchedEffect(channel.id) {
        isLoading = true
        try {
            messages = AuthManager.messages(channel.id)
        } catch (e: Exception) {
            status = "Error: ${e.message}"
        }
        isLoading = false
    }

    DisposableEffect(channel.id) {
        RealtimeManager.joinChannel(channel.id)
        val remove = RealtimeManager.addListener { event, payload ->
            if (event == "message.created" && payload is org.json.JSONObject) {
                val message: Message = Json { ignoreUnknownKeys = true }
                    .decodeFromString(payload.toString())
                if (message.channelId == channel.id && messages.none { it.id == message.id }) {
                    scope.launch { messages = listOf(message) + messages }
                }
            }
        }
        onDispose {
            RealtimeManager.leaveChannel(channel.id)
            remove()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(channel.name, style = MaterialTheme.typography.headlineMedium)

        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }

        if (isLoading) {
            CircularProgressIndicator()
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                if (messages.isEmpty()) {
                    item { Text("No messages yet") }
                } else {
                    items(messages) { message ->
                        Column {
                            Text("${message.senderId}: ${message.content}")
                            if (message.attachments.isNotEmpty()) {
                                Text(
                                    "${message.attachments.size} attachment(s)",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }
                }
                if (status.isNotBlank()) {
                    item { Text(status) }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(onClick = { fileLauncher.launch("*/*") }) {
                Text("Attach")
            }
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                label = { Text("Message") },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                modifier = Modifier.weight(1f)
            )
            Button(
                onClick = {
                    val text = input.trim()
                    if (text.isNotBlank() || pendingAttachmentIds.isNotEmpty()) {
                        scope.launch {
                            try {
                                AuthManager.sendMessage(channel.id, text, pendingAttachmentIds)
                                input = ""
                                pendingAttachmentIds = emptyList()
                                messages = AuthManager.messages(channel.id)
                            } catch (e: Exception) {
                                status = "Send failed: ${e.message}"
                            }
                        }
                    }
                },
                enabled = input.trim().isNotBlank() || pendingAttachmentIds.isNotEmpty()
            ) {
                Text("Send")
            }
        }
    }
}
