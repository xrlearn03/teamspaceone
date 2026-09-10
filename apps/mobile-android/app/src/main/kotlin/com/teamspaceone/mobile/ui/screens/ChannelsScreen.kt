package com.teamspaceone.mobile.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.teamspaceone.mobile.data.deeplink.DeepLink
import com.teamspaceone.mobile.data.remote.AuthManager
import com.teamspaceone.mobile.data.remote.Channel

@Composable
fun ChannelsScreen(
    onBack: () -> Unit = {},
    deepLink: DeepLink? = null,
    onDeepLinkConsumed: () -> Unit = {}
) {
    var isLoading by remember { mutableStateOf(true) }
    var channels by remember { mutableStateOf<List<Channel>>(emptyList()) }
    var status by remember { mutableStateOf("") }
    var selectedChannel by remember { mutableStateOf<Channel?>(null) }

    LaunchedEffect(Unit) {
        isLoading = true
        try {
            channels = AuthManager.channels()
        } catch (e: Exception) {
            status = "Error: ${e.message}"
        }
        isLoading = false
    }

    LaunchedEffect(deepLink) {
        val target = deepLink as? DeepLink.Channel ?: return@LaunchedEffect
        try {
            val list = channels.takeIf { it.isNotEmpty() } ?: AuthManager.channels().also { channels = it }
            selectedChannel = list.find { it.id == target.id }
            if (selectedChannel == null) {
                status = "Channel not found"
            }
        } catch (e: Exception) {
            status = "Error: ${e.message}"
        }
        onDeepLinkConsumed()
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val isWide = maxWidth >= 600.dp
        if (isWide) {
            Row(modifier = Modifier.fillMaxSize()) {
                ChannelList(
                    channels = channels,
                    isLoading = isLoading,
                    status = status,
                    selectedChannel = selectedChannel,
                    onChannelSelected = { selectedChannel = it },
                    modifier = Modifier
                        .weight(0.4f)
                        .fillMaxHeight()
                )
                VerticalDivider()
                Box(
                    modifier = Modifier
                        .weight(0.6f)
                        .fillMaxHeight()
                ) {
                    selectedChannel?.let { channel ->
                        ChannelDetailScreen(channel = channel)
                    } ?: run {
                        EmptyDetailPane(text = "Select a channel")
                    }
                }
            }
        } else {
            selectedChannel?.let { channel ->
                ChannelDetailScreen(channel = channel, onBack = { selectedChannel = null })
            } ?: run {
                ChannelList(
                    channels = channels,
                    isLoading = isLoading,
                    status = status,
                    selectedChannel = selectedChannel,
                    onChannelSelected = { selectedChannel = it },
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}

@Composable
private fun ChannelList(
    channels: List<Channel>,
    isLoading: Boolean,
    status: String,
    selectedChannel: Channel?,
    onChannelSelected: (Channel) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Channels", style = MaterialTheme.typography.headlineMedium)

        if (isLoading) {
            CircularProgressIndicator()
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (channels.isEmpty()) {
                    item { Text("No channels") }
                } else {
                    items(channels, key = { it.id }) { channel ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onChannelSelected(channel) }
                                .padding(8.dp)
                        ) {
                            Text(
                                channel.name,
                                style = MaterialTheme.typography.bodyLarge,
                                color = if (selectedChannel?.id == channel.id) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurface
                                }
                            )
                            if (!channel.description.isNullOrBlank()) {
                                Text(
                                    channel.description,
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                            Text(
                                "#${channel.type}",
                                style = MaterialTheme.typography.labelSmall
                            )
                            HorizontalDivider(modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
                if (status.isNotBlank()) {
                    item { Text(status) }
                }
            }
        }
    }
}


