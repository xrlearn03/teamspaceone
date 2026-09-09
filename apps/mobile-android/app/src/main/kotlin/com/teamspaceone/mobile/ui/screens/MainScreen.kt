package com.teamspaceone.mobile.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.VideoCall
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.teamspaceone.mobile.data.deeplink.DeepLinkManager
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp

private data class TabItem(
    val label: String,
    val icon: ImageVector,
    val content: @Composable () -> Unit
)

@Composable
fun MainScreen(
    onSignOut: () -> Unit = {}
) {
    val tabs = listOf(
        TabItem("Channels", Icons.AutoMirrored.Filled.Message) { ChannelsScreen() },
        TabItem("Projects", Icons.Filled.Folder) { ProjectsScreen() },
        TabItem("Files", Icons.Filled.Description) { FilesScreen() },
        TabItem("Meeting", Icons.Filled.VideoCall) { MeetingScreen() },
        TabItem("Profile", Icons.Filled.Person) { ProfileScreen(onSignOut) }
    )
    var selectedTab by remember { mutableStateOf(0) }
    val deepLink by DeepLinkManager.pendingDeepLink.collectAsState()

    LaunchedEffect(deepLink) {
        val link = deepLink ?: return@LaunchedEffect
        val path = link.path?.lowercase() ?: link.host?.lowercase() ?: ""
        val index = when {
            path.contains("channel") || path.contains("message") -> 0
            path.contains("project") -> 1
            path.contains("file") -> 2
            path.contains("meet") || path.contains("call") -> 3
            else -> null
        }
        index?.let { selectedTab = it }
        DeepLinkManager.consume()
    }
    val isTablet = LocalConfiguration.current.screenWidthDp >= 600

    if (isTablet) {
        Row(modifier = Modifier.fillMaxSize()) {
            NavigationRail {
                tabs.forEachIndexed { index, tab ->
                    NavigationRailItem(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) }
                    )
                }
            }
            VerticalDivider()
            Box(modifier = Modifier.weight(1f)) {
                tabs[selectedTab].content()
            }
        }
    } else {
        Scaffold(
            bottomBar = {
                NavigationBar {
                    tabs.forEachIndexed { index, tab ->
                        NavigationBarItem(
                            selected = selectedTab == index,
                            onClick = { selectedTab = index },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) }
                        )
                    }
                }
            }
        ) { paddingValues ->
            Box(
                modifier = Modifier
                    .padding(paddingValues)
                    .fillMaxSize()
            ) {
                tabs[selectedTab].content()
            }
        }
    }
}
