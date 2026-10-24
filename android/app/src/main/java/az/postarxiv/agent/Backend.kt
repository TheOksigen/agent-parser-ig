package az.postarxiv.agent

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

class ApiError(val status: Int, val code: String, message: String) : Exception(message)

class Backend(private val base: String, private val token: String) {
    companion object {
        fun validateBase(input: String): String {
            val uri = URI(input.trim().trimEnd('/'))
            require(uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null && (uri.path.isNullOrEmpty() || uri.path == "/")) { "Server ünvanı düzgün deyil." }
            val host = uri.host
            val privateHost = host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" ||
                host.matches(Regex("10\\.\\d+\\.\\d+\\.\\d+")) || host.matches(Regex("192\\.168\\.\\d+\\.\\d+")) ||
                host.matches(Regex("172\\.(1[6-9]|2[0-9]|3[01])\\.\\d+\\.\\d+"))
            require(uri.scheme == "https" || (BuildConfig.DEBUG && uri.scheme == "http" && privateHost)) { "HTTPS tələb olunur. Debug APK yalnız lokal şəbəkədə HTTP qəbul edir." }
            return input.trim().trimEnd('/')
        }
    }
    suspend fun post(action: String, body: JSONObject = JSONObject()): JSONObject = withContext(Dispatchers.IO) {
        val c = URL("$base/api/agent/$action").openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"; c.connectTimeout = 15000; c.readTimeout = 30000
            c.instanceFollowRedirects = false; c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            if (action != "register") c.setRequestProperty("Authorization", "Bearer $token")
            c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = c.responseCode
            val stream = if (status in 200..299) c.inputStream else c.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: "{}"
            val json = try { JSONObject(text) } catch (_: Exception) { JSONObject() }
            if (status !in 200..299) throw ApiError(status, json.optString("code", "HTTP_ERROR"), json.optString("error", "Server cavabı: $status"))
            json
        } finally { c.disconnect() }
    }
}
