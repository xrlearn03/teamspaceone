package com.teamspaceone.mobile.ui.screens

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
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.unit.dp
import com.teamspaceone.mobile.data.remote.AuthManager
import com.teamspaceone.mobile.data.remote.NewTask
import com.teamspaceone.mobile.data.remote.Project
import com.teamspaceone.mobile.data.remote.Task
import kotlinx.coroutines.launch

@Composable
fun ProjectDetailScreen(project: Project, onBack: () -> Unit = {}) {
    var isLoading by remember { mutableStateOf(true) }
    var tasks by remember { mutableStateOf<List<Task>>(emptyList()) }
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(project.id) {
        isLoading = true
        try {
            tasks = AuthManager.tasks(project.id)
        } catch (e: Exception) {
            status = "Error: ${e.message}"
        }
        isLoading = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(project.name, style = MaterialTheme.typography.headlineMedium)

        if (!project.description.isNullOrBlank()) {
            Text(project.description)
        }
        Text(project.status)

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
                if (tasks.isEmpty()) {
                    item { Text("No tasks yet") }
                } else {
                    items(tasks) { task ->
                        Text("${task.title}  (${task.status} · ${task.priority})")
                    }
                }
                if (status.isNotBlank()) {
                    item { Text(status) }
                }
            }
        }

        OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            label = { Text("Task title") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = description,
            onValueChange = { description = it },
            label = { Text("Description") },
            modifier = Modifier.fillMaxWidth()
        )

        Button(
            onClick = {
                val text = title.trim()
                if (text.isNotBlank()) {
                    scope.launch {
                        try {
                            AuthManager.createTask(project.id, text, description.takeIf { it.isNotBlank() })
                            title = ""
                            description = ""
                            tasks = AuthManager.tasks(project.id)
                        } catch (e: Exception) {
                            status = "Create failed: ${e.message}"
                        }
                    }
                }
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Add Task")
        }
    }
}
