package com.teamspaceone.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.teamspaceone.mobile.ui.screens.RootScreen
import com.teamspaceone.mobile.ui.theme.TeamspaceOneTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TeamspaceOneTheme {
                RootScreen()
            }
        }
    }
}

@Preview
@Composable
fun RootScreenPreview() {
    TeamspaceOneTheme {
        RootScreen()
    }
}
