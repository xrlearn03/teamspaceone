package com.teamspaceone.mobile.data.remote

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.security.MessageDigest

object FileRepository {
    suspend fun listFiles(): List<FileRecord> = APIClient.request("/files")

    suspend fun getFile(fileId: String): FileRecord = APIClient.request("/files/$fileId")

    suspend fun uploadFile(context: Context, uri: Uri): FileRecord {
        val resolver = context.contentResolver
        val (fileName, mimeType, size) = resolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
            cursor.moveToFirst()
            val name = if (nameIndex >= 0) cursor.getString(nameIndex) else "upload"
            val fileSize = if (sizeIndex >= 0) cursor.getLong(sizeIndex) else 0L
            val ext = MimeTypeMap.getFileExtensionFromUrl(name) ?: name.substringAfterLast('.', "")
            val type = resolver.getType(uri) ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
            Triple(name, type, fileSize.toInt())
        } ?: throw APIError("Could not read file metadata", 0)

        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw APIError("Could not read file", 0)

        val sha256 = bytes.sha256Hex()
        val category = categoryForMime(mimeType)
        val organisationId = AuthManager.activeOrg() ?: throw APIError("No organisation selected", 0)

        val presign: PresignUploadResponse = APIClient.post(
            "/files/presign-upload",
            PresignUploadRequest(
                fileName = fileName,
                mimeType = mimeType,
                size = size,
                category = category,
                sha256 = sha256,
                resourceType = "organisation",
                resourceId = organisationId
            )
        )

        val ok = APIClient.putBytes(presign.uploadUrl, bytes, presign.uploadHeaders)
        if (!ok) throw APIError("Upload failed", 0)

        return APIClient.post("/files/${presign.id}/complete", CompleteUploadRequest(sha256 = sha256))
    }

    private fun categoryForMime(mime: String): String {
        return when {
            mime.startsWith("image/") -> "images"
            mime.startsWith("video/") -> "videos"
            mime.startsWith("audio/") -> "audio"
            mime == "application/pdf" ||
                mime == "text/plain" ||
                mime == "application/msword" ||
                mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> "documents"
            mime == "application/vnd.ms-excel" ||
                mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" -> "spreadsheets"
            mime == "application/vnd.ms-powerpoint" ||
                mime == "application/vnd.openxmlformats-officedocument.presentationml.presentation" -> "presentations"
            mime == "application/zip" || mime == "application/x-zip-compressed" || mime == "application/x-rar-compressed" -> "archives"
            else -> "other"
        }
    }

    private fun ByteArray.sha256Hex(): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(this)
        return digest.joinToString("") { "%02x".format(it) }
    }
}

@kotlinx.serialization.Serializable
private data class PresignUploadRequest(
    val fileName: String,
    val mimeType: String,
    val size: Int,
    val category: String,
    val sha256: String,
    val resourceType: String? = null,
    val resourceId: String? = null
)

@kotlinx.serialization.Serializable
private data class CompleteUploadRequest(
    val sha256: String
)
