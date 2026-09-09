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
import com.teamspaceone.mobile.data.remote.Project

@Composable
fun ProjectsScreen(onBack: () -> Unit = {}) {
    var isLoading by remember { mutableStateOf(true) }
    var projects by remember { mutableStateOf<List<Project>>(emptyList()) }
    var status by remember { mutableStateOf("") }
    var selectedProject by remember { mutableStateOf<Project?>(null) }

    LaunchedEffect(Unit) {
        isLoading = true
        try {
            projects = AuthManager.projects()
        } catch (e: Exception) {
            status = "Error: ${e.message}"
        }
        isLoading = false
    }

    selectedProject?.let { project ->
        ProjectDetailScreen(project = project, onBack = { selectedProject = null })
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Projects")

        if (isLoading) {
            CircularProgressIndicator()
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (projects.isEmpty()) {
                    item { Text("No projects") }
                } else {
                    items(projects) { project ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selectedProject = project }
                                .padding(8.dp)
                        ) {
                            Text("${project.name}  (${project.status})")
                            if (!project.description.isNullOrBlank()) {
                                Text(project.description)
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
