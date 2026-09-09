package com.teamspaceone.mobile.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.teamspaceone.mobile.data.remote.FileRecord
import com.teamspaceone.mobile.data.remote.FileRepository
import kotlinx.coroutines.launch

@Composable
fun FilesScreen(onBack: () -> Unit = {}) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var files by remember { mutableStateOf<List<FileRecord>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            isLoading = true
            errorMessage = null
            try {
                FileRepository.uploadFile(context, uri)
                files = FileRepository.listFiles()
            } catch (e: Exception) {
                errorMessage = e.message ?: "Upload failed"
            }
            isLoading = false
        }
    }

    LaunchedEffect(Unit) {
        isLoading = true
        try {
            files = FileRepository.listFiles()
        } catch (e: Exception) {
            errorMessage = e.message ?: "Failed to load files"
        }
        isLoading = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Files", style = MaterialTheme.typography.headlineMedium)

        Button(
            onClick = { launcher.launch("*/*") },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading
        ) {
            Text("Upload File")
        }

        if (isLoading && files.isEmpty()) {
            CircularProgressIndicator()
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(files, key = { it.id }) { file ->
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(file.originalName, maxLines = 1)
                    Text(
                        "${formatBytes(file.size)} • ${file.status}",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }

        errorMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error)
        }

        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }
    }
}

private fun formatBytes(bytes: Int): String {
    if (bytes < 1024) return "$bytes B"
    var value = bytes / 1024.0
    val units = listOf("KB", "MB", "GB", "TB")
    var unitIndex = 0
    while (value >= 1024 && unitIndex < units.lastIndex) {
        value /= 1024.0
        unitIndex++
    }
    return String.format("%.1f %s", value, units[unitIndex])
}
