package com.teamspaceone.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.teamspaceone.mobile.data.realtime.RealtimeManager
import com.teamspaceone.mobile.data.remote.AuthManager
import com.teamspaceone.mobile.data.remote.Organisation
import com.teamspaceone.mobile.data.remote.UserContext
import com.teamspaceone.mobile.data.remote.UserDto
import kotlinx.coroutines.launch

@Composable
fun HomeScreen(
    onChannels: () -> Unit = {},
    onProjects: () -> Unit = {},
    onMeeting: () -> Unit = {},
    onSignOut: () -> Unit = {}
) {
    var isLoading by remember { mutableStateOf(true) }
    var user by remember { mutableStateOf<UserDto?>(null) }
    var organisations by remember { mutableStateOf<List<Organisation>>(emptyList()) }
    var context by remember { mutableStateOf<UserContext?>(null) }
    var status by remember { mutableStateOf("Loading...") }
    val events = remember { mutableStateListOf<String>() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        isLoading = true
        try {
            user = AuthManager.me()
            organisations = AuthManager.organisations()
            val first = organisations.firstOrNull()
            if (first != null) {
                context = AuthManager.myContext(first.id)
                RealtimeManager.connect()
            } else {
                status = "Create or join an organisation to continue."
            }
        } catch (e: Exception) {
            status = "Error: ${e.message}"
        }
        isLoading = false
    }

    DisposableEffect(Unit) {
        val remove = RealtimeManager.addListener { event, _ ->
            events.add(0, event)
            if (events.size > 10) events.removeLast()
        }
        onDispose { remove() }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Teamspace One", style = MaterialTheme.typography.headlineMedium)

        if (isLoading) {
            CircularProgressIndicator()
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                user?.let { u ->
                    item {
                        Text("User", style = MaterialTheme.typography.titleMedium)
                        Text(u.email)
                        if (!u.firstName.isNullOrBlank() || !u.lastName.isNullOrBlank()) {
                            Text(
                                listOfNotNull(u.firstName, u.lastName).joinToString(" "),
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                        Divider(modifier = Modifier.padding(vertical = 8.dp))
                    }
                }

                item {
                    Text("Organisations", style = MaterialTheme.typography.titleMedium)
                }

                if (organisations.isEmpty()) {
                    item { Text("No organisations") }
                } else {
                    items(organisations) { org ->
                        Button(
                            onClick = { scope.launch { loadContext(org.id) { c -> context = c } } },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(org.name)
                        }
                    }
                }

                context?.let { ctx ->
                    item {
                        Divider(modifier = Modifier.padding(vertical = 8.dp))
                        Text("Context", style = MaterialTheme.typography.titleMedium)
                        Text("Organisation: ${ctx.organisationId}")
                        Text("Permissions: ${ctx.permissions.size}")
                        if (ctx.isSuperAdmin == true) {
                            Text("Super admin")
                        }
                    }
                }

                item {
                    Divider(modifier = Modifier.padding(vertical = 8.dp))
                    Text("Collaboration", style = MaterialTheme.typography.titleMedium)
                }

                item {
                    Button(onClick = onChannels, modifier = Modifier.fillMaxWidth()) {
                        Text("Channels")
                    }
                }

                item {
                    Button(onClick = onProjects, modifier = Modifier.fillMaxWidth()) {
                        Text("Projects")
                    }
                }

                item {
                    Button(onClick = onMeeting, modifier = Modifier.fillMaxWidth()) {
                        Text("Meeting")
                    }
                }

                item {
                    Text(status, style = MaterialTheme.typography.bodySmall)
                }

                if (events.isNotEmpty()) {
                    item {
                        Divider(modifier = Modifier.padding(vertical = 8.dp))
                        Text("Realtime events", style = MaterialTheme.typography.titleMedium)
                    }
                    items(events) { event ->
                        Text(event, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            Button(
                onClick = {
                    AuthManager.logout()
                    onSignOut()
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color.Red),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Sign Out")
            }
        }
    }
}

private suspend fun loadContext(
    organisationId: String,
    onContext: (UserContext) -> Unit
) {
    try {
        val ctx = AuthManager.myContext(organisationId)
        onContext(ctx)
    } catch (_: Exception) {
    }
}
