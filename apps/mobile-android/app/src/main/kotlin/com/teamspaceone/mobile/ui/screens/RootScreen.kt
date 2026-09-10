package com.teamspaceone.mobile.ui.screens

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.teamspaceone.mobile.data.remote.AuthManager

private enum class AuthRoute {
    Login, Main
}

@Composable
fun RootScreen() {
    var route by remember { mutableStateOf(if (AuthManager.accessToken() != null) AuthRoute.Main else AuthRoute.Login) }

    when (route) {
        AuthRoute.Login -> LoginScreen(onLoggedIn = { route = AuthRoute.Main })
        AuthRoute.Main -> MainScreen(onSignOut = { route = AuthRoute.Login })
    }
}
