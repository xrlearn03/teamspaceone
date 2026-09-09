package com.teamspaceone.mobile.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.teamspaceone.mobile.data.remote.AuthManager
import com.teamspaceone.mobile.data.remote.Channel

@Composable
fun ChannelsScreen(onBack: () -> Unit = {}) {
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

    selectedChannel?.let { channel ->
        ChannelDetailScreen(channel = channel, onBack = { selectedChannel = null })
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Channels")

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
                    items(channels) { channel ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selectedChannel = channel }
                                .padding(8.dp)
                        ) {
                            Text("# ${channel.name}  (${channel.type})")
                            if (!channel.description.isNullOrBlank()) {
                                Text(channel.description)
                            }
                        }
                    }
                }
                if (status.isNotBlank()) {
                    item { Text(status) }
                }
            }
        }

        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }
    }
}
