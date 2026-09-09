package com.teamspaceone.mobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.PresentToAll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.teamspaceone.mobile.data.webrtc.WebRTCManager
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

private fun initials(name: String): String {
    val words = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    return when {
        words.size >= 2 -> (words[0].take(1) + words[1].take(1)).uppercase()
        words.isNotEmpty() -> words[0].take(2).uppercase()
        else -> name.take(2).uppercase()
    }
}

private val placeholderColors = listOf(
    Color(0xFF5E8B7E),
    Color(0xFF7D5A5A),
    Color(0xFF5A7D9A),
    Color(0xFF8A7D5A),
    Color(0xFF7D5A8A)
)

private fun colorForName(name: String): Color {
    return placeholderColors[abs(name.hashCode()) % placeholderColors.size]
}

private fun abs(value: Int): Int = if (value < 0) -value else value

@Composable
fun ParticipantGrid(
    participants: List<WebRTCManager.RemoteParticipant>,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(8.dp)
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 160.dp),
        modifier = modifier,
        contentPadding = contentPadding,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(participants, key = { it.id }) { participant ->
            ParticipantTile(
                participant = participant,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
fun ParticipantTile(
    participant: WebRTCManager.RemoteParticipant,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(4f / 3f)
            .clip(MaterialTheme.shapes.medium)
    ) {
        if (participant.hasVideo && participant.videoTrack != null) {
            VideoRenderer(
                track = participant.videoTrack,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            PlaceholderAvatar(name = participant.displayName)
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .background(Color.Black.copy(alpha = 0.6f))
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = participant.displayName,
                color = Color.White,
                style = MaterialTheme.typography.labelMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )

            if (participant.isScreenShare) {
                Icon(
                    imageVector = Icons.Default.PresentToAll,
                    contentDescription = "Screen share",
                    tint = Color.White
                )
            }

            Icon(
                imageVector = if (participant.hasAudio) Icons.Default.Mic else Icons.Default.MicOff,
                contentDescription = if (participant.hasAudio) "Mic on" else "Mic off",
                tint = Color.White
            )
        }
    }
}

@Composable
private fun PlaceholderAvatar(name: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colorForName(name)),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.3f))
                .padding(16.dp)
        ) {
            Text(
                text = initials(name),
                color = Color.White,
                style = MaterialTheme.typography.headlineMedium
            )
        }
    }
}

@Composable
private fun VideoRenderer(
    track: VideoTrack,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    AndroidView(
        factory = { _ ->
            SurfaceViewRenderer(context).apply {
                init(WebRTCManager.eglBase?.eglBaseContext, null)
            }
        },
        update = { renderer ->
            track.removeSink(renderer)
            track.addSink(renderer)
        },
        modifier = modifier,
        onRelease = { renderer ->
            track.removeSink(renderer)
            renderer.release()
        }
    )
}
