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

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val isWide = maxWidth >= 600.dp
        if (isWide) {
            Row(modifier = Modifier.fillMaxSize()) {
                ProjectList(
                    projects = projects,
                    isLoading = isLoading,
                    status = status,
                    selectedProject = selectedProject,
                    onProjectSelected = { selectedProject = it },
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
                    selectedProject?.let { project ->
                        ProjectDetailScreen(project = project)
                    } ?: run {
                        EmptyDetailPane(text = "Select a project")
                    }
                }
            }
        } else {
            selectedProject?.let { project ->
                ProjectDetailScreen(project = project, onBack = { selectedProject = null })
            } ?: run {
                ProjectList(
                    projects = projects,
                    isLoading = isLoading,
                    status = status,
                    selectedProject = selectedProject,
                    onProjectSelected = { selectedProject = it },
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}

@Composable
private fun ProjectList(
    projects: List<Project>,
    isLoading: Boolean,
    status: String,
    selectedProject: Project?,
    onProjectSelected: (Project) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Projects", style = MaterialTheme.typography.headlineMedium)

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
                    items(projects, key = { it.id }) { project ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onProjectSelected(project) }
                                .padding(8.dp)
                        ) {
                            Text(
                                "${project.name} (${project.status})",
                                style = MaterialTheme.typography.bodyLarge,
                                color = if (selectedProject?.id == project.id) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurface
                                }
                            )
                            if (!project.description.isNullOrBlank()) {
                                Text(
                                    project.description,
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
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
