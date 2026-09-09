package com.teamspaceone.mobile.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.teamspaceone.mobile.data.deeplink.DeepLink
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.teamspaceone.mobile.data.deeplink.DeepLinkManager
import com.teamspaceone.mobile.data.push.PushTokenManager

private data class TabItem(
    val label: String,
    val icon: ImageVector,
    val content: @Composable () -> Unit
)

@Composable
fun MainScreen(
    onSignOut: () -> Unit = {}
) {
    var selectedTab by remember { mutableStateOf(0) }
    var deepLink by remember { mutableStateOf<DeepLink?>(null) }
    val pendingDeepLink by DeepLinkManager.pendingDeepLink.collectAsState()

    LaunchedEffect(pendingDeepLink) {
        pendingDeepLink?.let {
            deepLink = it
            DeepLinkManager.consume()
        }
    }

    SideEffect {
        when (deepLink) {
            is DeepLink.Channel -> if (selectedTab != 0) selectedTab = 0
            is DeepLink.File -> if (selectedTab != 2) selectedTab = 2
            is DeepLink.Meeting -> if (selectedTab != 3) selectedTab = 3
            else -> {}
        }
    }

    val onDeepLinkConsumed = { deepLink = null }
    val tabs = listOf(
        TabItem("Channels", Icons.AutoMirrored.Filled.Message) { ChannelsScreen(deepLink = deepLink, onDeepLinkConsumed = onDeepLinkConsumed) },
        TabItem("Projects", Icons.Filled.Folder) { ProjectsScreen() },
        TabItem("Files", Icons.Filled.Description) { FilesScreen(deepLink = deepLink, onDeepLinkConsumed = onDeepLinkConsumed) },
        TabItem("Meeting", Icons.Filled.VideoCall) { MeetingScreen(deepLink = deepLink, onDeepLinkConsumed = onDeepLinkConsumed) },
        TabItem("Profile", Icons.Filled.Person) { ProfileScreen(onSignOut) }
    )

    val context = LocalContext.current
    val requiresNotificationPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
    var notificationsGranted by remember {
        mutableStateOf(
            if (requiresNotificationPermission) {
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            } else {
                true
            }
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        notificationsGranted = granted
    }

    LaunchedEffect(Unit) {
        if (requiresNotificationPermission && !notificationsGranted) {
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    LaunchedEffect(notificationsGranted) {
        if (notificationsGranted) {
            PushTokenManager.fetchAndRegisterToken(context)
        }
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
