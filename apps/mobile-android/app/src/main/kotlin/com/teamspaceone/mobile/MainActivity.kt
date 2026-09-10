package com.teamspaceone.mobile

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.teamspaceone.mobile.data.deeplink.DeepLinkManager
import com.teamspaceone.mobile.ui.screens.RootScreen
import com.teamspaceone.mobile.ui.theme.TeamspaceOneTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)
        setContent {
            TeamspaceOneTheme {
                RootScreen()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        intent?.data?.let { DeepLinkManager.setDeepLink(it) }
    }
}

@Preview
@Composable
fun RootScreenPreview() {
    TeamspaceOneTheme {
        RootScreen()
    }
}
