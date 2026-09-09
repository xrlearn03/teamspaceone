package com.teamspaceone.mobile.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.teamspaceone.mobile.data.realtime.RealtimeManager
import com.teamspaceone.mobile.data.remote.AuthManager
import com.teamspaceone.mobile.data.remote.Channel
import com.teamspaceone.mobile.data.remote.FileRecord
import com.teamspaceone.mobile.data.remote.FileRepository
import com.teamspaceone.mobile.data.remote.Message
import com.teamspaceone.mobile.data.remote.MessageAttachment
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun ChannelDetailScreen(channel: Channel, onBack: () -> Unit = {}) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var isLoading by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    var messages by remember { mutableStateOf<List<Message>>(emptyList()) }
    var input by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var pendingAttachmentIds by remember { mutableStateOf<List<String>>(emptyList()) }
    var attachmentFiles by remember { mutableStateOf<Map<String, FileRecord>>(emptyMap()) }

    val fileLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            status = "Uploading attachment…"
            try {
                val file = FileRepository.uploadFile(context, uri)
                pendingAttachmentIds = pendingAttachmentIds + file.id
                status = null
            } catch (e: Exception) {
                status = "Attachment upload failed: ${e.message}"
            }
        }
    }

    fun loadMessages(showRefresh: Boolean = false) {
        scope.launch {
            if (showRefresh) isRefreshing = true else isLoading = messages.isEmpty()
            status = null
            try {
                messages = AuthManager.messages(channel.id)
            } catch (e: Exception) {
                status = e.message ?: "Failed to load messages"
            }
            if (showRefresh) isRefreshing = false else isLoading = false
        }
    }

    LaunchedEffect(channel.id) {
        loadMessages()
    }

    LaunchedEffect(messages) {
        val fileIds = messages.flatMap { it.attachments.map { a -> a.fileId } }.toSet()
        val missing = fileIds.filter { it !in attachmentFiles }
        if (missing.isEmpty()) return@LaunchedEffect
        val records = try {
            missing.map { id -> async { runCatching { FileRepository.getFile(id) }.getOrNull() } }
                .awaitAll()
                .filterNotNull()
        } catch (_: Exception) {
            emptyList()
        }
        attachmentFiles = attachmentFiles + records.associateBy { it.id }
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

    val pullRefreshState = rememberPullToRefreshState()
    val grouped = remember(messages) { groupMessagesByDate(messages) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(channel.name, style = MaterialTheme.typography.headlineMedium)

        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }

        Box(modifier = Modifier.weight(1f)) {
            PullToRefreshBox(
                isRefreshing = isRefreshing,
                onRefresh = { loadMessages(showRefresh = true) },
                state = pullRefreshState
            ) {
                if (isLoading && messages.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                } else if (status != null && messages.isEmpty()) {
                    ErrorState(
                        message = status ?: "",
                        onRetry = { loadMessages() },
                        modifier = Modifier.fillMaxSize()
                    )
                } else if (messages.isEmpty()) {
                    EmptyMessagesView(modifier = Modifier.fillMaxSize())
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        grouped.forEach { (date, dayMessages) ->
                            stickyHeader {
                                DateHeader(date = date)
                            }
                            items(dayMessages, key = { it.id }) { message ->
                                MessageItem(
                                    message = message,
                                    attachmentFiles = attachmentFiles
                                )
                            }
                        }
                    }
                }
            }
        }

        if (pendingAttachmentIds.isNotEmpty()) {
            Text(
                text = "${pendingAttachmentIds.size} attachment(s) ready",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = { fileLauncher.launch("*/*") }) {
                Icon(Icons.Default.AttachFile, contentDescription = "Attach file")
            }

            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                label = { Text("Message") },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                modifier = Modifier.weight(1f),
                maxLines = 4
            )

            IconButton(
                onClick = {
                    val text = input.trim()
                    if (text.isNotBlank() || pendingAttachmentIds.isNotEmpty()) {
                        scope.launch {
                            try {
                                AuthManager.sendMessage(channel.id, text, pendingAttachmentIds)
                                input = ""
                                pendingAttachmentIds = emptyList()
                                loadMessages()
                            } catch (e: Exception) {
                                status = "Send failed: ${e.message}"
                            }
                        }
                    }
                },
                enabled = input.trim().isNotBlank() || pendingAttachmentIds.isNotEmpty()
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
            }
        }
    }
}

@Composable
private fun EmptyMessagesView(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.InsertDriveFile,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "No messages yet",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = "Be the first to send a message.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun ErrorState(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = message,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium
        )
        Spacer(modifier = Modifier.height(8.dp))
        Button(onClick = onRetry) {
            Text("Retry")
        }
    }
}

@Composable
private fun DateHeader(date: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerHighest,
        shape = MaterialTheme.shapes.small
    ) {
        Text(
            text = date,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun MessageItem(
    message: Message,
    attachmentFiles: Map<String, FileRecord>
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        shape = MaterialTheme.shapes.medium
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = message.senderId,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = formatTime(message.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (message.content.isNotBlank()) {
                Text(
                    text = message.content,
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            if (message.attachments.isNotEmpty()) {
                AttachmentChips(
                    attachments = message.attachments,
                    attachmentFiles = attachmentFiles
                )
            }
        }
    }
}

@Composable
private fun AttachmentChips(
    attachments: List<MessageAttachment>,
    attachmentFiles: Map<String, FileRecord>
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        attachments.forEach { attachment ->
            val file = attachmentFiles[attachment.fileId]
            val fileName = file?.originalName ?: "Attachment"
            val isVisual = file?.mimeType?.startsWith("image/") == true || file?.mimeType?.startsWith("video/") == true
            val imageUrl = file?.thumbnailUrl ?: file?.previewUrl

            Surface(
                color = MaterialTheme.colorScheme.surfaceContainerHighest,
                shape = MaterialTheme.shapes.small
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (isVisual && !imageUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = imageUrl,
                            contentDescription = fileName,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(40.dp)
                                .clip(MaterialTheme.shapes.small)
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.AttachFile,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Text(
                        text = fileName,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

private fun groupMessagesByDate(messages: List<Message>): List<Pair<String, List<Message>>> {
    val zone = ZoneId.systemDefault()
    val dateFormatter = DateTimeFormatter.ofPattern("MMMM d, yyyy").withZone(zone)
    val grouped = messages.groupBy { message ->
        try {
            val instant = Instant.parse(message.createdAt)
            dateFormatter.format(instant)
        } catch (_: Exception) {
            message.createdAt
        }
    }
    return grouped.toList().sortedBy {
        try {
            Instant.parse(it.second.firstOrNull()?.createdAt ?: it.first)
        } catch (_: Exception) {
            Instant.EPOCH
        }
    }
}

private fun formatTime(iso: String): String {
    return try {
        val instant = Instant.parse(iso)
        DateTimeFormatter
            .ofPattern("HH:mm")
            .withZone(ZoneId.systemDefault())
            .format(instant)
    } catch (_: Exception) {
        iso
    }
}
