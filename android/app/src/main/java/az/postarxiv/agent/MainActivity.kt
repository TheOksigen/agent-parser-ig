package az.postarxiv.agent

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.MotionEvent
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.IOException
import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlin.coroutines.resume

class MainActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var store: Store
    private lateinit var state: JSONObject
    private lateinit var web: WebView
    private val pageReady = mutableMapOf<WebView, CompletableDeferred<Unit>>()
    private val loadingUrls = mutableMapOf<WebView, String>()
    private val pageFailures = mutableMapOf<WebView, JSONObject>()
    private var lastNavigation = 0L
    private val extractorScript by lazy { assets.open("extractor.js").bufferedReader().use { it.readText() } }
    private val navigationScript by lazy { assets.open("navigation.js").bufferedReader().use { it.readText() } }
    private var profileScrollY = 0.0
    private var browsingGrid = "posts"
    private lateinit var status: TextView
    private lateinit var details: TextView
    private lateinit var taskIndicator: View
    private lateinit var startButton: Button
    private lateinit var pauseButton: Button
    private lateinit var setup: LinearLayout
    private lateinit var serverField: EditText
    private lateinit var codeField: EditText
    private lateinit var nameField: EditText
    private var runner: Job? = null
    private var intervalMs = 10000L
    private var lastCheckpointAt = 0L
    private var maxScrolls = 200
    private var maxPosts = 500
    private var lastMessage = "Hazırdır."
    private val green = Color.rgb(33, 118, 86)

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun message(text: String) {
        lastMessage = text
        status.text = text
        val color = when {
            listOf("xəta", "alınmadı", "dayandırıldı", "dayandırılıb").any { text.contains(it, true) } -> Color.rgb(190, 68, 62)
            listOf("gözlənilir", "gözləyir", "giriş", "fasilə", "yoxlamanı tamamla").any { text.contains(it, true) } -> Color.rgb(202, 145, 38)
            state.optJSONObject("task") != null -> green
            else -> Color.rgb(143, 153, 147)
        }
        (taskIndicator.background as? android.graphics.drawable.GradientDrawable)?.setColor(color)
        updateTaskDisplay()
    }
    private fun updateTaskDisplay() {
        val current = state.optJSONObject("task") ?: run { details.text = ""; return }
        val username = current.optString("username").takeIf { it.isNotBlank() } ?: return
        val checkpoint = state.optJSONObject("checkpoint") ?: JSONObject()
        val total = checkpoint.optJSONArray("links")?.length() ?: 0
        if (checkpoint.optString("phase") != "posts" || total == 0) {
            details.text = "@$username"
            return
        }
        val index = checkpoint.optInt("index").coerceIn(0, total)
        val deferred = checkpoint.optJSONArray("deferredPosts")?.length() ?: 0
        val resolved = (index - deferred).coerceAtLeast(0)
        val progressTotal = if (checkpoint.optString("stopReason") == "date_boundary") index else total
        val progress = if (progressTotal > 0) (resolved * 100 / progressTotal).coerceIn(0, 100) else 0
        details.text = "@$username · $resolved/$progressTotal · $progress%"
    }
    private fun save() { store.write(state) }
    private fun api() = Backend(state.getString("server"), state.getString("token"))
    private fun task() = state.getJSONObject("task")
    private fun checkpoint() = state.getJSONObject("checkpoint")
    private fun owned() = JSONObject().put("taskId", task().getString("id")).put("leaseToken", task().getString("leaseToken"))
    private fun blankCheckpoint() = JSONObject().put("grid", "reels").put("secondGrid", false).put("linkGrids", JSONArray()).put("phase", "discovery").put("links", JSONArray()).put("index", 0).put("scrolls", 0).put("skipped", 0).put("version", 4).put("filtered", 0).put("matched", 0).put("olderStreak", 0).put("discoveryDone", false).put("deferredPosts", JSONArray())

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = Store(this)
        try { state = store.read() } catch (_: Exception) {
            AlertDialog.Builder(this).setTitle("Cihaz məlumatları açıla bilmədi")
                .setMessage("Şifrələnmiş açar oxunmur. Tətbiq məlumatlarını Android ayarlarından sıfırlayıb yeni kodla qoşun.")
                .setPositiveButton("Bağla") { _, _ -> finish() }.show(); return
        }
        if (!state.has("installationId")) state.put("installationId", UUID.randomUUID().toString())
        if (!state.has("token")) state.put("token", UUID.randomUUID().toString() + UUID.randomUUID().toString())
        save()
        window.statusBarColor = green
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.WHITE); setPadding(0, dp(8), 0, 0) }
        val header = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(12), 0, dp(12), 0) }
        status = TextView(this).apply { textSize = 12f; setTextColor(Color.DKGRAY); setPadding(0, dp(2), 0, dp(3)) }
        details = TextView(this).apply { textSize = 11f; setTextColor(Color.GRAY) }
        taskIndicator = View(this).apply {
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(Color.rgb(143, 153, 147))
            }
        }
        val taskRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(0, dp(2), 0, dp(2))
            addView(taskIndicator, LinearLayout.LayoutParams(dp(7), dp(7)).apply { marginEnd = dp(7) })
            addView(details, LinearLayout.LayoutParams(0, dp(22), 1f))
        }
        header.addView(taskRow); root.addView(header)
        setup = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), 0, dp(16), dp(4)) }
        serverField = field("Server: https://arxiv.example.com").apply { setText(state.optString("server")); inputType = 17 }
        codeField = field("Birdəfəlik qoşulma kodu")
        nameField = field("Cihaz adı").apply { setText(android.os.Build.MODEL) }
        setup.addView(serverField); setup.addView(codeField); setup.addView(nameField)
        setup.addView(button("Serverə qoşul") { register() }); root.addView(setup)
        val buttons = LinearLayout(this).apply { setPadding(dp(8), 0, dp(8), 0) }
        startButton = button("Başlat") { start() }
        pauseButton = button("Dayandır") { pause() }
        val login = button("Instagram") {
            if (runner?.isActive == true) message("Əvvəlcə Dayandır düyməsinə toxunun.")
            else if (cooldownRemaining() > 0) message(cooldownMessage())
            else web.loadUrl("https://www.instagram.com/")
        }
        for (b in listOf(startButton, pauseButton, login)) buttons.addView(b, LinearLayout.LayoutParams(0, dp(38), 1f))
        root.addView(buttons)
        web = createWebView()
        val browserFrame = FrameLayout(this)
        browserFrame.addView(web, FrameLayout.LayoutParams(-1, -1))
        root.addView(browserFrame, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
        root.setOnApplyWindowInsetsListener { view, insets ->
            view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        root.requestApplyInsets()
        setup.visibility = if (state.has("deviceId")) View.GONE else View.VISIBLE
        startButton.isEnabled = state.has("deviceId"); pauseButton.isEnabled = false
        message(if (state.has("task")) "Saxlanmış tapşırıq var. Başlat ilə davam edin." else "Instagram girişini manual tamamlayıb Başlat düyməsinə toxunun.")
        details.text = state.optString("server", "Əvvəlcə cihazı serverə qoşun.")
        if (cooldownRemaining() > 0) message(cooldownMessage())
        else web.loadUrl("https://www.instagram.com/")
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView() = WebView(this).apply {
        settings.javaScriptEnabled = true; settings.domStorageEnabled = true
        settings.allowFileAccess = false; settings.allowContentAccess = false
        settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.mediaPlaybackRequiresUserGesture = true
        settings.setSupportMultipleWindows(false)
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                cooldownRemaining() > 0 || request.url.scheme != "https" || request.url.host !in listOf("www.instagram.com", "instagram.com")
            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                pageFailures.remove(view)
                if (loadingUrls.containsKey(view)) loadingUrls[view] = url
            }
            override fun onPageCommitVisible(view: WebView, url: String) {
                val expected = loadingUrls[view] ?: return
                val path = android.net.Uri.parse(url).path.orEmpty()
                if (view.url == url && (path.trimEnd('/') == android.net.Uri.parse(expected).path?.trimEnd('/') ||
                    path.startsWith("/accounts/") || path.startsWith("/challenge") || path.startsWith("/checkpoint"))) pageReady[view]?.complete(Unit)
            }
            override fun onPageFinished(view: WebView, url: String) {
                if (view.url == url && view.progress == 100) pageReady[view]?.complete(Unit)
                CookieManager.getInstance().flush()
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame || pageFailures[view]?.has("httpStatus") == true) return
                val name = Regex("ERR_[A-Z_]+").find(error.description.toString())?.value ?: "WEBVIEW_${error.errorCode}"
                val networkError = error.errorCode in listOf(ERROR_HOST_LOOKUP, ERROR_CONNECT, ERROR_IO, ERROR_TIMEOUT)
                pageFailed(view, request, JSONObject().put("state", if (networkError) "network_error" else "navigation_error")
                    .put("message", "Instagram səhifəsi açılmadı: $name. Post ötürülmədi."))
            }
            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                if (!request.isForMainFrame) return
                val status = response.statusCode
                val kind = when (status) {
                    404, 410 -> "unavailable"
                    401, 403 -> "blocked"
                    429 -> "throttled"
                    in 500..599 -> "temporary_error"
                    else -> "navigation_error"
                }
                val reason = when (kind) {
                    "throttled" -> "Instagram sorğu limiti tətbiq edib (HTTP 429)."
                    "blocked" -> "Instagram girişi məhdudlaşdırıb (HTTP $status). Instagram düyməsi ilə giriş/yoxlamanı tamamlayın."
                    "unavailable" -> "Paylaşım əlçatan deyil (HTTP $status)."
                    "temporary_error" -> "Instagram serveri müvəqqəti xəta qaytarır (HTTP $status)."
                    else -> "Instagram səhifəsi açılmadı (HTTP $status). Post ötürülmədi."
                }
                val retryAfter = response.responseHeaders?.entries?.firstOrNull { it.key.equals("Retry-After", true) }?.value
                pageFailed(view, request, JSONObject().put("state", kind).put("httpStatus", status)
                    .put("message", reason).put("retryAt", retryAt(retryAfter)))
            }
        }
    }

    private fun pageFailed(view: WebView, request: WebResourceRequest, result: JSONObject) {
        if (!request.isForMainFrame || request.url.toString() !in listOf(view.url, loadingUrls[view])) return
        pageFailures[view] = result
        val postPage = Regex("^/(?:[A-Za-z0-9._]{1,30}/)?(?:p|reel)/[A-Za-z0-9_-]+/?$").matches(request.url.path.orEmpty())
        // A single failing post does not prove that other posts are rate-limited.
        if (!postPage && result.optString("state") in listOf("throttled", "temporary_error")) beginCooldown(result)
        // Wake the reader without throwing away the HTTP status or treating an error page as a post.
        pageReady[view]?.complete(Unit)
        if (view === web) message(if (cooldownRemaining() > 0) cooldownMessage() else result.getString("message"))
    }

    private fun retryAt(header: String?): Long {
        val value = header?.trim() ?: return 0
        value.toLongOrNull()?.takeIf { it >= 0 }?.let { seconds ->
            return runCatching { Math.addExact(System.currentTimeMillis(), Math.multiplyExact(seconds, 1000L)) }.getOrDefault(Long.MAX_VALUE)
        }
        return runCatching { ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli() }.getOrDefault(0)
    }

    private fun cooldownRemaining() = (state.optLong("instagramCooldownUntil") - System.currentTimeMillis()).coerceAtLeast(0)

    private fun cooldownMessage(): String {
        val seconds = (cooldownRemaining() / 1000) + 1
        return "${state.optString("instagramCooldownReason", "Instagram fasilə tələb edir.")} Yeni cəhdə ${seconds / 60} dəq ${seconds % 60} san. Mərhələ saxlanılıb."
    }

    private fun beginCooldown(result: JSONObject) {
        val now = System.currentTimeMillis()
        if (cooldownRemaining() <= 0) {
            val limited = result.optString("state") == "throttled"
            val count = if (limited) (state.optInt("instagramLimitCount") + 1).coerceAtMost(4) else 1
            val waitMs = if (limited) 15 * 60_000L * (1L shl (count - 1)) else 60_000L
            state.put("instagramCooldownUntil", maxOf(now + waitMs, result.optLong("retryAt")))
                .put("instagramCooldownReason", result.getString("message"))
                .put("instagramCooldownKind", result.getString("state"))
            if (limited) {
                state.put("instagramLimitCount", count)
                state.put("instagramIntervalMs", maxOf(6000L, state.optLong("instagramIntervalMs") * 2).coerceAtMost(30000L))
            }
            save()
        } else if (result.optLong("retryAt") > state.optLong("instagramCooldownUntil")) {
            state.put("instagramCooldownUntil", result.getLong("retryAt")); save()
        }
        web.post { if (!isDestroyed && cooldownRemaining() > 0) suspendInstagramPages() }
    }

    private fun suspendInstagramPages() {
        // Unload the page so its JavaScript cannot keep requesting data during a cooldown.
        web.stopLoading()
        if (web.url != "about:blank") web.loadUrl("about:blank")
    }

    private suspend fun awaitCooldown() {
        if (cooldownRemaining() > 0) suspendInstagramPages()
        while (cooldownRemaining() > 0) {
            message(cooldownMessage())
            delay(minOf(1000L, cooldownRemaining().coerceAtLeast(1)))
        }
    }

    private fun heartbeatBody() = owned().put("state", if (cooldownRemaining() > 0) "COOLDOWN" else "RUNNING")
        .put("message", lastMessage.take(500)).put("appVersion", BuildConfig.VERSION_NAME)

    private suspend fun sendHeartbeat(body: JSONObject = heartbeatBody()) {
        val response = api().post("heartbeat", body)
        response.optJSONObject("config")?.optInt("intervalSeconds")?.takeIf { it in 2..300 }?.let {
            intervalMs = it * 1000L
            if (state.has("task")) task().put("intervalSeconds", it)
            save()
        }
    }

    private fun field(hintText: String) = EditText(this).apply { hint = hintText; textSize = 14f; setSingleLine(true); minimumHeight = dp(42); setPadding(paddingLeft, dp(4), paddingRight, dp(4)) }
    private fun button(label: String, onClick: () -> Unit) = Button(this).apply { text = label; textSize = 10f; isAllCaps = false; setTextColor(green); minHeight = dp(34); minimumHeight = dp(34); setPadding(dp(6), 0, dp(6), 0); setOnClickListener { onClick() } }

    private fun register() {
        if (runner?.isActive == true) return
        scope.launch {
            try {
                val base = Backend.validateBase(serverField.text.toString())
                val client = Backend(base, state.getString("token"))
                message("Serverə qoşulur…")
                val result = client.post("register", JSONObject().put("code", codeField.text.toString()).put("installationId", state.getString("installationId"))
                    .put("token", state.getString("token")).put("name", nameField.text.toString()).put("appVersion", BuildConfig.VERSION_NAME))
                state.put("server", base).put("deviceId", result.getString("deviceId")); save()
                codeField.setText(""); setup.visibility = View.GONE; startButton.isEnabled = true
                details.text = base; message("Cihaz qoşuldu. Instagram-a daxil olub toplamanı başladın.")
            } catch (e: Exception) { message(e.message ?: "Qoşulma alınmadı.") }
        }
    }

    private fun start() {
        if (!state.has("deviceId") || runner?.isActive == true) return
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        runner = scope.launch {
            startButton.isEnabled = false; pauseButton.isEnabled = true
            var errors = 0
            try {
                while (isActive) {
                    try {
                        if (state.has("pendingFinish")) { api().post("finish", state.getJSONObject("pendingFinish")); clearTask(); continue }
                        if (state.has("pendingDefer")) { api().post("defer", state.getJSONObject("pendingDefer")); clearTask(); continue }
                        if (state.has("task")) {
                            sendHeartbeat()
                        } else {
                            awaitCooldown()
                            message("Növbə yoxlanılır…")
                            val result = api().post("claim", JSONObject().put("protocolVersion", 4).put("appVersion", BuildConfig.VERSION_NAME))
                            val config = result.getJSONObject("config")
                            intervalMs = config.getLong("intervalSeconds") * 1000
                            maxScrolls = config.getInt("maxScrolls"); maxPosts = config.getInt("maxPosts")
                            if (result.isNull("task")) { message("Növbədə tapşırıq yoxdur. Gözlənilir…"); delay(30000); continue }
                            val next = result.getJSONObject("task")
                            state.put("task", next)
                            state.put("checkpoint", next.optJSONObject("checkpoint") ?: blankCheckpoint())
                            save()
                        }
                        errors = 0
                        coroutineScope {
                            val heartbeat = launch {
                                while (isActive) {
                                    delay(30000)
                                    if (!state.has("task")) break
                                    // Checkpoints are sent only by the sequential collector, not this timer.
                                    sendHeartbeat()
                                }
                            }
                            try { collectTask() } finally { heartbeat.cancelAndJoin() }
                        }
                    } catch (e: CancellationException) { throw e }
                    catch (e: InstagramAccessRequired) {
                        message("Instagram girişini və ya yoxlamasını tamamlayıb yenidən Başlat düyməsinə toxunun."); break
                    }
                    catch (e: InstagramNavigationStopped) {
                        message("${e.message} Toplama dayandırılıb; Instagram düyməsi ilə bağlantını yoxlayın."); break
                    }
                    catch (e: ApiError) {
                        if (e.code == "LEASE_LOST") {
                            // Never submit an old batch under another task's lease.
                            if (state.has("pending") || state.has("buffer")) state.put("lastUnsentBatch", JSONObject()
                                .put("task", task()).put("pending", state.optJSONObject("pending")).put("buffer", state.optJSONArray("buffer")))
                            clearTask(); message("Tapşırıq yenidən bölüşdürülüb. Növbədən götürüləcək."); delay(intervalMs)
                        } else if (e.status == 401 || e.status == 403) {
                            message("${e.message} Yeni kodla qoşulmaq üçün ayarları açın."); setup.visibility = View.VISIBLE; break
                        } else if (e.status in 400..499 && e.status != 429) {
                            message("${e.message} Toplama dayandırıldı; saxlanmış nəticə qorunur."); break
                        } else {
                            errors++; message("Server əlçatan deyil. Nəticə cihazda saxlanılıb; yenidən cəhd ediləcək.")
                            delay(minOf(120000L, 5000L * (1L shl minOf(errors, 4))))
                        }
                    } catch (e: Exception) {
                        errors++; message("Bağlantı/yükləmə xətası. Mərhələ saxlanılıb; yenidən cəhd ediləcək.")
                        delay(minOf(120000L, 5000L * (1L shl minOf(errors, 4))))
                    }
                }
            } finally {
                startButton.isEnabled = state.has("deviceId"); pauseButton.isEnabled = false
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }

    private fun pause() {
        runner?.cancel(); web.stopLoading()
        message(if (cooldownRemaining() > 0) "Dayandırılıb. ${cooldownMessage()}" else "Dayandırılıb. Mərhələ və göndərilməmiş nəticə cihazda saxlanılıb.")
        if (::state.isInitialized) save()
    }

    private fun clearTask() {
        for (key in listOf("task", "checkpoint", "pending", "pendingFinish", "pendingDefer", "buffer", "candidates")) state.remove(key)
        save()
    }

    private suspend fun pace() {
        // Re-read the setting while waiting so an admin change applies to this wait too.
        while (true) {
            val remaining = maxOf(intervalMs, state.optLong("instagramIntervalMs")) - (SystemClock.elapsedRealtime() - lastNavigation)
            if (remaining <= 0) break
            delay(minOf(1000L, remaining))
        }
        lastNavigation = SystemClock.elapsedRealtime()
    }

    private suspend fun loadProfile() {
        val url = "https://www.instagram.com/${task().getString("username")}/${if (browsingGrid == "reels") "reels/" else ""}"
        if (cooldownRemaining() > 0) throw InstagramPageException(JSONObject()
            .put("state", state.optString("instagramCooldownKind", "throttled"))
            .put("message", state.getString("instagramCooldownReason")).put("retryAt", state.getLong("instagramCooldownUntil")))
        web.stopLoading()
        pageFailures.remove(web)
        val ready = CompletableDeferred<Unit>()
        pageReady[web] = ready; loadingUrls[web] = url
        try {
            web.loadUrl(url)
            ready.await()
            delay(350) // Poll the actual post data next; don't wait for images or a fixed 2.5 seconds.
            pageFailures[web]?.let { throw InstagramPageException(it) }
        } finally { pageReady.remove(web); loadingUrls.remove(web) }
    }

    private suspend fun evaluate(script: String): String = suspendCancellableCoroutine { continuation ->
        web.evaluateJavascript(script) { result -> if (continuation.isActive) continuation.resume(result ?: "null") }
    }

    private suspend fun navigation(mode: String, url: String = "", extra: JSONObject = JSONObject()): JSONObject {
        val request = JSONObject(extra.toString()).put("mode", mode).put("username", task().getString("username")).put("grid", browsingGrid)
        if (url.isNotEmpty()) request.put("shortcode", code(url))
        val encoded = withTimeoutOrNull(3000) { evaluate(navigationScript.replace("__REQUEST__", request.toString())) }
            ?: return JSONObject().put("state", "unknown")
        val decoded = JSONTokener(encoded).nextValue()
        return if (decoded is String) JSONObject(decoded) else JSONObject().put("state", "unknown")
    }

    private suspend fun tap(point: JSONObject) {
        val x = point.getDouble("x"); val y = point.getDouble("y")
        require(x.isFinite() && y.isFinite() && x in 0.0..1.0 && y in 0.0..1.0)
        val downTime = SystemClock.uptimeMillis()
        fun dispatch(action: Int) {
            val event = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action,
                (x * web.width).toFloat(), (y * web.height).toFloat(), 0)
            try { web.dispatchTouchEvent(event) } finally { event.recycle() }
        }
        dispatch(MotionEvent.ACTION_DOWN)
        var released = false
        try { delay(60); dispatch(MotionEvent.ACTION_UP); released = true }
        finally { if (!released) dispatch(MotionEvent.ACTION_CANCEL) }
    }

    private fun isProfileUrl(url: String?): Boolean = runCatching {
        val uri = java.net.URI(url ?: "")
        uri.host in listOf("www.instagram.com", "instagram.com") &&
            uri.path.trim('/').equals(task().getString("username") + if (browsingGrid == "reels") "/reels" else "", true)
    }.getOrDefault(false)

    private suspend fun waitForProfile(timeoutMs: Long): Boolean = withTimeoutOrNull(timeoutMs) {
        while (!navigation("inspect").optBoolean("onProfile")) delay(200)
        navigation("restore", extra = JSONObject().put("scrollY", profileScrollY))
        true
    } ?: false

    private suspend fun returnToProfile(): Boolean {
        if (cooldownRemaining() > 0) return false
        try {
            if (navigation("inspect").optBoolean("onProfile") && !pageFailures.containsKey(web)) return true
            pageFailures.remove(web)
            // A client-side modal may not create an Android history entry. Close it first.
            val close = navigation("close")
            if (close.optString("state") == "tap") {
                tap(close)
                if (waitForProfile(3000)) return true
            }
            val history = web.copyBackForwardList()
            val index = (history.currentIndex - 1 downTo 0).firstOrNull { isProfileUrl(history.getItemAtIndex(it)?.url) }
            if (index != null) {
                web.stopLoading()
                web.goBackOrForward(index - history.currentIndex)
                if (waitForProfile(6000)) return true
            }
        } catch (e: CancellationException) { throw e }
        catch (_: Exception) { /* Reload only the profile if its in-page navigation could not be restored. */ }
        return false
    }

    private suspend fun ensureProfileGrid(): JSONObject {
        if (navigation("inspect").optBoolean("onProfile")) {
            pageFailures[web]?.let { return JSONObject(it.toString()) }
            return JSONObject().put("state", "ready")
        }
        if (returnToProfile()) return JSONObject().put("state", "ready")
        pace()
        return boundedRead { loadProfile(); JSONObject().put("state", "ready") }
    }

    private suspend fun readFromProfile(url: String): JSONObject {
        val profile = ensureProfileGrid()
        if (profile.optString("state") != "ready") return profile
        val links = checkpoint().getJSONArray("links")
        val positions = (0 until links.length()).associate { code(links.getString(it)) to it }
        val targetIndex = positions[code(url)] ?: 0
        val deadline = SystemClock.elapsedRealtime() + 120000L
        // Normally the tile is already present. A resumed job may need to scroll back to it.
        for (step in 0..8) {
            var tile = navigation("locate", url)
            var settling = 0
            while (tile.optString("state") in listOf("positioning", "obscured", "unknown") && settling++ < 4) {
                delay(250); tile = navigation("locate", url)
            }
            if (tile.optString("state") == "tap") {
                pace()
                // Recheck the hit target after pacing; the page may have shifted meanwhile.
                tile = navigation("locate", url)
                if (tile.optString("state") != "tap") continue
                profileScrollY = tile.optDouble("scrollY", 0.0)
                // Read the visible tile again on resume/device handoff; candidates are local only.
                val grid = extract("discover").optJSONArray("candidates") ?: JSONArray()
                val gridMetrics = (0 until grid.length()).map { grid.getJSONObject(it) }
                    .firstOrNull { code(it.getString("permalink")) == code(url) }?.optJSONObject("gridMetrics")
                pageFailures.remove(web)
                loadingUrls[web] = tile.optString("href", url)
                val result = try { boundedRead {
                    tap(tile)
                    while (true) {
                        pageFailures[web]?.let { throw InstagramPageException(it) }
                        val current = extract("post", url)
                        if (current.optString("state") in listOf("blocked", "private", "throttled", "temporary_error", "navigation_error", "network_error")) return@boundedRead current
                        if (navigation("inspect", url).optBoolean("opened")) {
                            delay(350)
                            return@boundedRead readPost(url)
                        }
                        delay(250)
                    }
                    @Suppress("UNREACHABLE_CODE")
                    JSONObject().put("state", "timeout")
                } } finally { loadingUrls.remove(web) }
                if (result.optString("state") == "ready" && gridMetrics != null) {
                    val metrics = result.optJSONObject("metrics") ?: JSONObject()
                    gridMetrics.keys().forEach { key ->
                        val previous = metrics.optJSONObject(key)
                        val incoming = gridMetrics.getJSONObject(key)
                        if (previous == null || (previous.optBoolean("approximate") && !incoming.optBoolean("approximate"))) metrics.put(key, incoming)
                    }
                    result.put("metrics", metrics)
                }
                if (result.optString("state") !in listOf("blocked", "private") && cooldownRemaining() <= 0) returnToProfile()
                return result
            }
            val page = boundedRead { extract("discover") }
            if (page.optString("state") != "ready") return page
            if (step == 8 || SystemClock.elapsedRealtime() >= deadline) break
            val visible = tile.optJSONArray("codes") ?: JSONArray()
            val indices = (0 until visible.length()).mapNotNull { positions[visible.getString(it)] }
            val direction = if (indices.isNotEmpty() && targetIndex < indices.min()) "up" else "down"
            message("Post profilin içində axtarılır… (${step + 1}/8)")
            pace()
            navigation("scroll", extra = JSONObject().put("direction", direction))
            delay(700)
        }
        return JSONObject().put("state", "navigation_error").put("message", "Post kartı profilin içində tapılmadı; sonra yenidən yoxlanacaq.")
    }

    private suspend fun extract(mode: String, url: String = ""): JSONObject {
        pageFailures[web]?.let { return JSONObject(it.toString()) }
        val request = JSONObject().put("mode", mode).put("username", task().getString("username"))
            .put("from", task().getString("from")).put("until", task().getString("until"))
        if (url.isNotEmpty()) request.put("shortcode", java.net.URI(url).path.split('/')[2])
        val encoded = withTimeoutOrNull(3000) { evaluate(extractorScript.replace("__REQUEST__", request.toString())) }
            ?: return JSONObject().put("state", "incomplete").put("message", "Səhifə məlumatı vaxtında oxunmadı.")
        val decoded = JSONTokener(encoded).nextValue()
        return if (decoded is String) JSONObject(decoded) else JSONObject().put("state", "incomplete")
    }

    private suspend fun readPost(url: String): JSONObject {
        var result = extract("post", url)
        var ready: JSONObject? = null
        var readyAt = 0L
        var stableReads = 0
        val metrics = JSONObject()
        // Caption and date often render before the action rail. Poll the same
        // document briefly; never request private APIs or wait for hidden counts.
        repeat(11) { attempt ->
            val status = result.optString("state")
            if (status !in listOf("ready", "incomplete", "expanding")) return result
            val before = metrics.toString()
            result.optJSONObject("metrics")?.let { extra ->
                extra.keys().forEach { key ->
                    val incoming = extra.getJSONObject(key)
                    val previous = metrics.optJSONObject(key)
                    if (previous == null || previous.optBoolean("approximate") || !incoming.optBoolean("approximate"))
                        metrics.put(key, incoming)
                }
            }
            if (result.optBoolean("countsHidden")) {
                metrics.remove("likeCount")
                if (metrics.optJSONObject("viewCount")?.optString("source") != "dom") metrics.remove("viewCount")
            }
            if (status == "ready") {
                if (ready == null) readyAt = SystemClock.elapsedRealtime()
                ready = JSONObject(result.toString())
            }
            ready?.put("metrics", JSONObject(metrics.toString()))
            stableReads = if (before == metrics.toString()) stableReads + 1 else 0
            if (ready != null && SystemClock.elapsedRealtime() - readyAt >= 2000L && stableReads >= 3) return ready!!
            if (attempt == 10) return ready ?: result
            delay(500)
            result = extract("post", url)
        }
        if (result.optString("state") !in listOf("ready", "incomplete", "expanding")) return result
        return ready ?: result
    }

    private class InstagramAccessRequired : Exception()
    private class InstagramNavigationStopped(message: String) : Exception(message)
    private class InstagramPageException(val result: JSONObject) : IOException(result.optString("message"))

    private suspend fun boundedRead(block: suspend () -> JSONObject): JSONObject {
        // A single unreadable page must never keep the whole device waiting for user input.
        val result = withTimeoutOrNull(14000) {
            try { block() }
            catch (e: CancellationException) { throw e }
            catch (e: InstagramPageException) { JSONObject(e.result.toString()) }
            catch (_: Exception) { JSONObject().put("state", "unavailable").put("message", "Səhifə yüklənmədi və ya oxunmadı.") }
        } ?: JSONObject().put("state", "timeout").put("message", "14 saniyədə post məlumatı alınmadı.")
        // A WebView error document may trigger another page callback after the HTTP failure.
        if (cooldownRemaining() > 0) return JSONObject().put("state", state.optString("instagramCooldownKind", "throttled"))
            .put("message", state.getString("instagramCooldownReason")).put("retryAt", state.getLong("instagramCooldownUntil"))
        if (result.optString("state") == "network_error") throw IOException(result.optString("message"))
        if (result.optString("state") !in listOf("ready", "outside", "blocked", "private")) {
            web.stopLoading()
            val network = getSystemService(ConnectivityManager::class.java)
            if (network.getNetworkCapabilities(network.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) != true)
                throw IOException("İnternet yoxdur. Toplama mərhələsi saxlanıldı.")
        }
        return result
    }

    private suspend fun requireInstagramAccess(result: JSONObject): Boolean {
        if (result.optString("state") in listOf("throttled", "temporary_error")) {
            beginCooldown(result)
            web.stopLoading()
            message(cooldownMessage())
            flushBuffer(true)
            sendHeartbeat()
            return false // Keep the current index. Retry this post after the saved cooldown.
        }
        if (result.optString("state") == "navigation_error") {
            message(result.getString("message")); flushBuffer(true)
            sendHeartbeat(heartbeatBody().put("state", "WAITING_USER"))
            throw InstagramNavigationStopped(result.getString("message"))
        }
        if (result.optString("state") != "blocked") return true
        flushBuffer(true)
        api().post("fail", owned().put("code", "INSTAGRAM_ACCESS_REQUIRED")
            .put("message", result.optString("message", "Cihazda Instagram giriş və ya təhlükəsizlik yoxlaması tələb edir.").take(500))
            .put("retryable", true).put("deviceState", "NEEDS_LOGIN"))
        clearTask()
        throw InstagramAccessRequired()
    }

    private fun recordSkip(next: JSONObject, url: String, result: JSONObject) {
        next.put("skipped", next.optInt("skipped") + 1)
        val recent = next.optJSONArray("recentSkips") ?: JSONArray()
        val reason = result.optString("message").ifBlank {
            when (result.optString("state")) {
                "private" -> "Məxfi post oxunmur."
                "unavailable" -> "Paylaşım əlçatan deyil."
                else -> "Tam təsvir, müəllif və ya tarix təsdiqlənmədi."
            }
        }.take(200)
        recent.put(JSONObject().put("permalink", url).put("reason", reason))
        while (recent.length() > 20) recent.remove(0)
        next.put("recentSkips", recent)
        message("Post avtomatik ötürüldü: $reason")
    }

    private fun removeDeferred(cp: JSONObject, url: String) {
        val pending = cp.optJSONArray("deferredPosts") ?: return
        for (i in pending.length() - 1 downTo 0) if (pending.getJSONObject(i).getString("permalink") == url) pending.remove(i)
    }

    private fun deferPost(next: JSONObject, url: String, result: JSONObject, previous: JSONObject?) {
        removeDeferred(next, url)
        val attempts = (previous?.optInt("attempts") ?: 0) + 1
        if (attempts >= 3) {
            recordSkip(next, url, JSONObject().put("message", "3 cəhddə açıla bilmədi: ${result.optString("message")}"))
        } else {
            val delayMs = if (result.optString("state") == "throttled") 15 * 60_000L * attempts else 60_000L * attempts
            val retryTime = maxOf(System.currentTimeMillis() + delayMs, result.optLong("retryAt"))
            val pending = next.optJSONArray("deferredPosts") ?: JSONArray()
            pending.put(JSONObject().put("permalink", url).put("retryAt", Instant.ofEpochMilli(retryTime).toString())
                .put("attempts", attempts).put("reason", result.optString("message").take(200)))
            next.put("deferredPosts", pending)
            message("Post sonraya saxlanıldı. Digər postlara davam edilir.")
        }
        if (result.optString("state") == "throttled") {
            val consecutive = state.optJSONArray("limitedPostCodes") ?: JSONArray()
            val seen = (0 until consecutive.length()).map { consecutive.getString(it) }
            if (code(url) !in seen) consecutive.put(code(url))
            while (consecutive.length() > 3) consecutive.remove(0)
            state.put("limitedPostCodes", consecutive)
            // Retry-After is preserved per post; three distinct failing posts suggest a broader limit.
            if (consecutive.length() >= 3) beginCooldown(result)
        }
    }

    private suspend fun releaseDeferredTask() {
        flushBuffer(true)
        state.put("pendingDefer", owned().put("checkpoint", JSONObject(checkpoint().toString()))); save()
        api().post("defer", state.getJSONObject("pendingDefer"))
        clearTask(); message("Gözləyən postlar serverdə saxlanıldı. Digər profilə keçilir.")
    }

    private suspend fun flushPending() {
        if (!state.has("pending")) return
        val pending = state.getJSONObject("pending")
        api().post("upload", pending)
        state.put("checkpoint", JSONObject(pending.getJSONObject("checkpoint").toString()))
        state.remove("pending"); lastCheckpointAt = SystemClock.elapsedRealtime(); save()
    }

    private suspend fun flushBuffer(checkpointOnly: Boolean = false) {
        flushPending()
        val buffer = state.optJSONArray("buffer") ?: JSONArray()
        if (buffer.length() == 0) {
            if (checkpointOnly) {
                sendHeartbeat(heartbeatBody().put("checkpoint", JSONObject(checkpoint().toString())))
                lastCheckpointAt = SystemClock.elapsedRealtime()
            }
            return
        }
        // Freeze payload + checkpoint together. Retrying never changes a batch's content or ID.
        state.put("pending", owned().put("batchId", UUID.randomUUID().toString())
            .put("checkpoint", JSONObject(checkpoint().toString())).put("posts", JSONArray(buffer.toString())))
        state.remove("buffer"); save()
        flushPending()
    }

    private fun rememberProgress(next: JSONObject, post: JSONObject?) {
        next.put("effectiveIntervalSeconds", (maxOf(intervalMs, state.optLong("instagramIntervalMs")) / 1000).toInt())
        val buffer = state.optJSONArray("buffer") ?: JSONArray()
        if (post != null) buffer.put(post)
        state.put("checkpoint", next).put("buffer", buffer); save()
    }

    private fun code(url: String) = java.net.URI(url).path.split('/')[2]

    private fun updateBoundary(next: JSONObject, result: JSONObject?, from: Instant) {
        if (result == null || !result.has("publishedAt")) {
            next.put("olderStreak", 0); next.remove("previousDate"); return
        }
        val date = Instant.parse(result.getString("publishedAt"))
        if (!next.has("oldestSeenAt") || next.isNull("oldestSeenAt") || date < Instant.parse(next.getString("oldestSeenAt"))) next.put("oldestSeenAt", date.toString())
        // Four consecutive posts before the requested start date end the scan.
        next.put("olderStreak", if (date.isBefore(from)) next.optInt("olderStreak") + 1 else 0)
        next.put("previousDate", date.toString())
        // This is a bounded chronological scan, not a claim that Instagram exposed its full history.
        if (next.optInt("olderStreak") >= 4) next.put("discoveryDone", true).put("stopReason", "date_boundary")
    }

    private suspend fun collectTask() {
        flushPending(); flushBuffer()
        val username = task().getString("username")
        val from = Instant.parse(task().getString("from"))
        val until = Instant.parse(task().getString("until"))
        if (checkpoint().optInt("version", 1) < 2) {
            val done = checkpoint().optString("phase") == "posts"
            // Revisit the selected interval once on upgrade: v1 already-processed posts have no metrics.
            checkpoint().put("version", 3).put("discoveryDone", done).put("index", 0)
                .put("matched", 0).put("filtered", 0).put("skipped", 0).put("olderStreak", 0)
            checkpoint().remove("oldestSeenAt"); checkpoint().remove("previousDate")
            if (done) checkpoint().put("stopReason", "legacy") else checkpoint().put("scrolls", 0)
            save()
        }
        checkpoint().put("version", 4); save()
        if (!checkpoint().has("grid")) checkpoint().put("grid", "posts")
        if (!checkpoint().has("linkGrids")) checkpoint().put("linkGrids", JSONArray().apply {
            repeat(checkpoint().getJSONArray("links").length()) { put(checkpoint().getString("grid")) }
        })
        save()
        var stagnant = 0
        var lastGrid = ""
        while (currentCoroutineContext().isActive) {
            awaitCooldown()
            var cp = checkpoint()
            if (cp.optBoolean("discoveryDone") && !cp.optBoolean("secondGrid") &&
                cp.optString("stopReason") in listOf("date_boundary", "page_end", "profile_unavailable")) {
                // Discard only unvisited tiles beyond this tab's date boundary.
                val visited = cp.optInt("index")
                val links = cp.getJSONArray("links")
                val grids = cp.getJSONArray("linkGrids")
                while (links.length() > visited) links.remove(links.length() - 1)
                while (grids.length() > visited) grids.remove(grids.length() - 1)
                cp.put("grid", if (cp.optString("grid") == "reels") "posts" else "reels")
                    .put("secondGrid", true).put("discoveryDone", false).put("olderStreak", 0)
                cp.remove("stopReason"); cp.remove("previousDate")
                profileScrollY = 0.0; stagnant = 0; lastGrid = ""
                save()
            }
            val normalPost = cp.optString("stopReason") != "date_boundary" && cp.getInt("index") < cp.getJSONArray("links").length()
            val deferred = cp.optJSONArray("deferredPosts") ?: JSONArray()
            val retry = if (!normalPost && cp.optBoolean("discoveryDone"))
                (0 until deferred.length()).map { deferred.getJSONObject(it) }.minByOrNull { Instant.parse(it.getString("retryAt")) }
                else null
            if (retry != null && Instant.parse(retry.getString("retryAt")).isAfter(Instant.now())) {
                releaseDeferredTask(); return
            }
            if (normalPost || retry != null) {
                val index = cp.getInt("index")
                val url = retry?.getString("permalink") ?: cp.getJSONArray("links").getString(index)
                val linkIndex = if (retry == null) index else (0 until cp.getJSONArray("links").length()).first { cp.getJSONArray("links").getString(it) == url }
                val targetGrid = cp.getJSONArray("linkGrids").optString(linkIndex, cp.optString("grid", "posts"))
                if (browsingGrid != targetGrid) { browsingGrid = targetGrid; profileScrollY = 0.0 }
                val candidate = state.optJSONObject("candidates")?.optJSONObject(code(url))
                val cached = candidate?.optJSONObject("post")
                val knownDate = candidate?.optString("publishedAt")?.takeIf { it.isNotBlank() && it != "null" }?.let { Instant.parse(it) }
                updateTaskDisplay()
                var result: JSONObject
                val keys = listOf("likeCount", "commentCount", "viewCount", "playCount", "shareCount", "repostCount", "saveCount")
                if (knownDate != null && (knownDate.isBefore(from) || !knownDate.isBefore(until))) {
                    result = JSONObject().put("state", "outside").put("publishedAt", knownDate.toString())
                } else if (cached?.optString("state") == "ready" && keys.all { cached.optJSONObject("metrics")?.has(it) == true }) {
                    result = JSONObject(cached.toString())
                } else {
                    result = readFromProfile(url)
                    if (result.optString("state") in listOf("ready", "outside")) { state.remove("limitedPostCodes"); save() }
                    // Grid and detail layouts can expose different metrics for the same post.
                    if (result.optString("state") == "ready" && cached != null) {
                        val metrics = JSONObject(cached.optJSONObject("metrics")?.toString() ?: "{}")
                        result.optJSONObject("metrics")?.let { extra ->
                            extra.keys().forEach { key -> metrics.put(key, extra.get(key)) }
                        }
                        if (cached.optBoolean("countsHidden") || result.optBoolean("countsHidden")) {
                            metrics.remove("likeCount")
                if (metrics.optJSONObject("viewCount")?.optString("source") != "dom") metrics.remove("viewCount")
                        }
                        result.put("metrics", metrics)
                    }
                    // A complete caption already verified in the profile document can complement the detail page.
                    if (result.optString("state") in listOf("incomplete", "expanding", "timeout", "unavailable") && cached?.optString("state") == "ready") {
                        val combined = JSONObject(cached.toString())
                        for (key in listOf("metrics", "metadata")) {
                            val data = combined.optJSONObject(key) ?: JSONObject()
                            result.optJSONObject(key)?.let { extra -> extra.keys().forEach { k -> data.put(k, extra.get(k)) } }
                            combined.put(key, data)
                        }
                        if (cached.optBoolean("countsHidden") || result.optBoolean("countsHidden")) {
                            combined.optJSONObject("metrics")?.remove("likeCount")
                            combined.optJSONObject("metrics")?.let { metrics ->
                                if (metrics.optJSONObject("viewCount")?.optString("source") != "dom") metrics.remove("viewCount")
                            }
                        }
                        result = combined
                    }
                }
                if (cooldownRemaining() <= 0 && result.optString("state") in listOf("throttled", "temporary_error", "navigation_error")) {
                    val next = JSONObject(checkpoint().toString()).put("phase", "posts").put("index", if (retry == null) index + 1 else index)
                    deferPost(next, url, result, retry)
                    if (retry == null) updateBoundary(next, null, from)
                    rememberProgress(next, null)
                    flushBuffer(true)
                    if (cooldownRemaining() > 0) sendHeartbeat()
                    continue
                }
                if (result.optString("state") == "ready") {
                    val metrics = result.optJSONObject("metrics") ?: JSONObject()
                    candidate?.optJSONObject("gridMetrics")?.let { extra ->
                        extra.keys().forEach { key ->
                            val previous = metrics.optJSONObject(key)
                            val incoming = extra.getJSONObject(key)
                            if (previous == null || (previous.optBoolean("approximate") && !incoming.optBoolean("approximate"))) metrics.put(key, incoming)
                        }
                    }
                    result.put("metrics", metrics)
                }
                if (!requireInstagramAccess(result)) continue
                val skipped = result.optString("state") !in listOf("ready", "outside")
                // flushBuffer may replace the JSONObject instance; always read the latest checkpoint.
                cp = checkpoint()
                val next = JSONObject(cp.toString()).put("phase", "posts").put("index", if (retry == null) index + 1 else index)
                if (retry != null) removeDeferred(next, url)
                var post: JSONObject? = null
                if (skipped) recordSkip(next, url, result)
                else {
                    val published = Instant.parse(result.getString("publishedAt"))
                    if (!published.isBefore(from) && published.isBefore(until) && result.optString("state") == "ready") {
                        post = JSONObject().put("username", username).put("permalink", url).put("publishedAt", published.toString())
                            .put("caption", result.getString("caption")).put("fullCaption", true).put("extraction", result.getString("extraction"))
                        for (key in listOf("instagramId", "mediaType", "metrics", "metadata", "authorUsername", "collaboratorUsernames")) if (result.has(key) && !result.isNull(key)) post.put(key, result.get(key))
                        next.put("matched", next.optInt("matched") + 1)
                    } else next.put("filtered", next.optInt("filtered") + 1)
                }
                if (retry == null) updateBoundary(next, if (skipped) null else result, from)
                state.optJSONObject("candidates")?.remove(code(url))
                rememberProgress(next, post)
                val buffer = state.optJSONArray("buffer") ?: JSONArray()
                if (retry != null || buffer.length() >= 10 || buffer.toString().toByteArray(Charsets.UTF_8).size >= 350000 ||
                    next.optInt("index") % 10 == 0 || SystemClock.elapsedRealtime() - lastCheckpointAt >= 15000) flushBuffer(true)
                continue
            }
            if (cp.optBoolean("discoveryDone")) break
            if (cp.optInt("scrolls") >= maxScrolls || cp.getJSONArray("links").length() >= maxPosts) {
                cp.put("discoveryDone", true).put("stopReason", "limit"); save(); continue
            }
            flushBuffer(true)
            val discoveryGrid = cp.optString("grid", "posts")
            if (browsingGrid != discoveryGrid) { browsingGrid = discoveryGrid; profileScrollY = 0.0 }
            val profile = ensureProfileGrid()
            val result = if (profile.optString("state") != "ready") profile else boundedRead {
                var found = extract("discover")
                var retries = 0
                while (found.optString("state") in listOf("ready", "incomplete") &&
                    (found.optJSONArray("candidates")?.length() ?: 0) == 0 && retries++ < 4) {
                    delay(500); found = extract("discover")
                }
                found
            }
            if (!requireInstagramAccess(result)) continue
            if (result.optString("state") == "private") {
                api().post("fail", owned().put("code", "PRIVATE_PROFILE").put("message", "Məxfi profil toplanmır.").put("retryable", false)); clearTask(); return
            }
            if (result.optString("state") != "ready") {
                checkpoint().put("discoveryDone", true).put("stopReason", "profile_unavailable"); save(); continue
            }
            cp = checkpoint()
            val links = cp.getJSONArray("links")
            val existing = (0 until links.length()).map { code(links.getString(it)) }.toMutableSet()
            val candidates = state.optJSONObject("candidates") ?: JSONObject()
            val discovered = result.optJSONArray("candidates") ?: JSONArray()
            val gridCodes = mutableListOf<String>()
            var added = 0
            for (i in 0 until discovered.length()) {
                val c = discovered.getJSONObject(i)
                val url = c.getString("permalink"); val id = code(url); gridCodes.add(id)
                if (existing.add(id) && links.length() < maxPosts) { links.put(url); cp.getJSONArray("linkGrids").put(discoveryGrid); candidates.put(id, c); added++ }
            }
            val signature = gridCodes.joinToString(",")
            stagnant = if (signature == lastGrid) stagnant + 1 else 0
            lastGrid = signature
            cp.put("phase", "discovery")
            state.put("candidates", candidates); save()
            if (added > 0) {
                flushBuffer(true) // Publish the discovered count before waiting for the next post's interval.
                continue // Process this page immediately, retaining the grid's scroll position.
            }
            if (stagnant >= 4) {
                cp.put("discoveryDone", true).put("stopReason", "page_end"); save(); continue
            }
            message("@$username: seçilmiş tarixlər üçün növbəti postlar axtarılır…")
            pace()
            if (withTimeoutOrNull(3000) { evaluate("window.scrollTo(0, document.documentElement.scrollHeight); true") } == null) {
                cp.put("discoveryDone", true).put("stopReason", "profile_unavailable"); save(); continue
            }
            cp.put("scrolls", cp.optInt("scrolls") + 1); save()
            delay(intervalMs)
        }
        flushBuffer(true)
        val cp = checkpoint()
        val why = when (cp.optString("stopReason")) {
            "date_boundary" -> "Ardıcıl köhnə postlarda tarix sərhədinə çatıldı."
            "limit" -> "Toplama limitinə çatıldı."
            "profile_unavailable" -> "Profil oxunmadığı üçün avtomatik ötürüldü."
            "manual" -> "İstifadəçi profili ötürdü."
            else -> "Görünən səhifələr yoxlanıldı."
        }
        val finish = owned().put("checkpoint", cp).put("message", "${cp.optInt("matched")} post seçilmiş tarixdə saxlanıldı; ${cp.optInt("filtered")} tarixdən kənar, ${cp.optInt("skipped")} oxunmayan post. $why Instagram tarixçəsinin tamlığı təsdiqlənmir.")
        state.put("pendingFinish", finish); save()
        api().post("finish", finish); clearTask(); message("Nəticələr saxlanıldı. Növbəti profil gözlənilir.")
    }

    override fun onPause() {
        super.onPause()
        if (runner?.isActive == true) pause()
        if (::web.isInitialized) CookieManager.getInstance().flush()
    }
    override fun onDestroy() {
        runner?.cancel(); scope.cancel()
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
