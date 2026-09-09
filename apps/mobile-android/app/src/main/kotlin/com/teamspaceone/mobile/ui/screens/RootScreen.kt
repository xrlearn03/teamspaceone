package com.teamspaceone.mobile.ui.screens

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.teamspaceone.mobile.data.remote.AuthManager

private enum class AuthRoute {
    Login, Home, Channels, Projects
}

@Composable
fun RootScreen() {
    var route by remember { mutableStateOf(if (AuthManager.accessToken() != null) AuthRoute.Home else AuthRoute.Login) }

    when (route) {
        AuthRoute.Login -> LoginScreen(onLoggedIn = { route = AuthRoute.Home })
        AuthRoute.Home -> HomeScreen(
            onChannels = { route = AuthRoute.Channels },
            onProjects = { route = AuthRoute.Projects },
            onSignOut = { route = AuthRoute.Login }
        )
        AuthRoute.Channels -> ChannelsScreen(onBack = { route = AuthRoute.Home })
        AuthRoute.Projects -> ProjectsScreen(onBack = { route = AuthRoute.Home })
    }
}
