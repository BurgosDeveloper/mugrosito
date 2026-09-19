package com.basilico.pizzeria

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var errorLayout: LinearLayout
    private lateinit var errorSubtext: TextView
    private lateinit var prefs: SharedPreferences

    private val PREFS_NAME = "MugrositoPosPrefs"
    private val KEY_SERVER_IP = "server_ip"
    private val DEFAULT_SERVER_IP = "192.168.10.47:3001"

    private var backPressedTime: Long = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        // Establecer pantalla completa y mantener pantalla encendida
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        super.onCreate(savedInstanceState)

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // Contenedor principal
        val rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0f172a"))
        }

        // 1. Inicializar WebView
        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0f172a"))
            overScrollMode = View.OVER_SCROLL_NEVER
        }

        setupWebViewSettings()
        setupWebViewClients()

        // 2. Barra de progreso superior discreta (3dp, color ámbar)
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                8
            ).apply {
                gravity = Gravity.TOP
            }
            isIndeterminate = false
            max = 100
            progress = 0
            visibility = View.VISIBLE
        }

        // 3. Vista de error / servidor desconectado
        errorLayout = createErrorLayout()
        errorLayout.visibility = View.GONE

        // 4. Botón flotante discreto de configuración de IP (Engranaje ⚙️ en esquina inferior derecha)
        val configButton = Button(this).apply {
            text = "⚙️"
            textSize = 18f
            val sizePx = (46 * resources.displayMetrics.density).toInt()
            layoutParams = FrameLayout.LayoutParams(sizePx, sizePx).apply {
                gravity = Gravity.BOTTOM or Gravity.END
                setMargins(0, 0, (16 * resources.displayMetrics.density).toInt(), (16 * resources.displayMetrics.density).toInt())
            }
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(160, 30, 41, 59))
                setStroke((1.5 * resources.displayMetrics.density).toInt(), Color.argb(180, 245, 158, 11))
            }
            background = bg
            alpha = 0.55f
            setOnClickListener {
                showServerConfigDialog()
            }
        }

        // Ensamblar interfaz
        rootLayout.addView(webView)
        rootLayout.addView(progressBar)
        rootLayout.addView(errorLayout)
        rootLayout.addView(configButton)

        setContentView(rootLayout)

        // Cargar URL del mesonero
        loadMeseroUrl()
    }

    override fun onResume() {
        super.onResume()
        setImmersiveFullScreen()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            setImmersiveFullScreen()
        }
    }

    /**
     * Mantiene la tablet en modo kiosco inmersivo total (sin barra de estado ni barra de navegación)
     */
    private fun setImmersiveFullScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
        }
    }

    private fun setupWebViewSettings() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }
            val originalUa = userAgentString
            userAgentString = "$originalUa MugrositoTablet/1.0 Kiosk"
        }
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
    }

    private fun setupWebViewClients() {
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onJsAlert(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("Mugrosito")
                    .setMessage(message ?: "")
                    .setPositiveButton("Aceptar") { _, _ -> result?.confirm() }
                    .setCancelable(false)
                    .show()
                return true
            }

            override fun onJsConfirm(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("Confirmar Acción")
                    .setMessage(message ?: "")
                    .setPositiveButton("Aceptar") { _, _ -> result?.confirm() }
                    .setNegativeButton("Cancelar") { _, _ -> result?.cancel() }
                    .setCancelable(false)
                    .show()
                return true
            }

            override fun onJsPrompt(view: WebView?, url: String?, message: String?, defaultValue: String?, result: JsPromptResult?): Boolean {
                val input = EditText(this@MainActivity).apply {
                    setText(defaultValue ?: "")
                }
                AlertDialog.Builder(this@MainActivity)
                    .setTitle(message ?: "Ingresar dato")
                    .setView(input)
                    .setPositiveButton("Aceptar") { _, _ -> result?.confirm(input.text.toString()) }
                    .setNegativeButton("Cancelar") { _, _ -> result?.cancel() }
                    .setCancelable(false)
                    .show()
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                errorLayout.visibility = View.GONE
                webView.visibility = View.VISIBLE
                setImmersiveFullScreen()
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    showErrorState()
                }
            }
        }
    }

    private fun createErrorLayout(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0f172a"))
            setPadding(40, 40, 40, 40)

            val titleText = TextView(this@MainActivity).apply {
                text = "🌭 Mugrosito POS"
                textSize = 28f
                setTextColor(Color.parseColor("#f59e0b"))
                setTypeface(null, Typeface.BOLD)
                gravity = Gravity.CENTER
            }

            val alertText = TextView(this@MainActivity).apply {
                text = "⚠️ No se pudo conectar con el servidor"
                textSize = 20f
                setTextColor(Color.WHITE)
                setTypeface(null, Typeface.BOLD)
                gravity = Gravity.CENTER
                setPadding(0, 24, 0, 8)
            }

            errorSubtext = TextView(this@MainActivity).apply {
                text = "Verifica que el computador principal esté encendido y en la misma red Wi-Fi."
                textSize = 14f
                setTextColor(Color.parseColor("#94a3b8"))
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, 32)
            }

            val retryButton = Button(this@MainActivity).apply {
                text = "🔄 REINTENTAR CONEXIÓN"
                textSize = 16f
                setTextColor(Color.BLACK)
                setTypeface(null, Typeface.BOLD)
                val bg = GradientDrawable().apply {
                    cornerRadius = 18f
                    setColor(Color.parseColor("#f59e0b"))
                }
                background = bg
                setPadding(36, 20, 36, 20)
                setOnClickListener {
                    errorLayout.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                    loadMeseroUrl()
                }
            }

            val configIpButton = Button(this@MainActivity).apply {
                text = "⚙️ CAMBIAR IP DEL SERVIDOR"
                textSize = 14f
                setTextColor(Color.WHITE)
                setTypeface(null, Typeface.BOLD)
                val bg = GradientDrawable().apply {
                    cornerRadius = 18f
                    setColor(Color.parseColor("#1e293b"))
                    setStroke(2, Color.parseColor("#475569"))
                }
                background = bg
                setPadding(30, 16, 30, 16)
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    topMargin = 20
                }
                setOnClickListener {
                    showServerConfigDialog()
                }
            }

            addView(titleText)
            addView(alertText)
            addView(errorSubtext)
            addView(retryButton)
            addView(configIpButton)
        }
    }

    private fun showErrorState() {
        val currentIp = getSavedServerIp()
        errorSubtext.text = "Servidor configurado: http://$currentIp/mesonero\n\nAsegúrate de que la PC esté encendida con el sistema abierto y la tablet esté en la misma red Wi-Fi."
        webView.visibility = View.GONE
        errorLayout.visibility = View.VISIBLE
    }

    private fun getSavedServerIp(): String {
        return prefs.getString(KEY_SERVER_IP, DEFAULT_SERVER_IP) ?: DEFAULT_SERVER_IP
    }

    private fun buildServerUrl(ipOrHost: String): String {
        var clean = ipOrHost.trim()
        if (clean.startsWith("http://") || clean.startsWith("https://")) {
            clean = clean.substringAfter("://")
        }
        if (clean.endsWith("/")) {
            clean = clean.substring(0, clean.length - 1)
        }
        if (!clean.contains(":")) {
            clean = "$clean:3001"
        }
        return "http://$clean/mesonero"
    }

    private fun loadMeseroUrl() {
        val serverIp = getSavedServerIp()
        val targetUrl = buildServerUrl(serverIp)
        webView.loadUrl(targetUrl)
    }

    private fun showServerConfigDialog() {
        val currentIp = getSavedServerIp()
        val input = EditText(this).apply {
            setText(currentIp)
            setHint("Ej: 192.168.10.47:3001 o 192.168.10.47")
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setPadding(40, 30, 40, 30)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
            setBackgroundColor(Color.parseColor("#1e293b"))
        }

        val container = FrameLayout(this).apply {
            setPadding(40, 20, 40, 20)
            addView(input)
        }

        AlertDialog.Builder(this)
            .setTitle("Configurar IP de la PC (Mugrosito)")
            .setMessage("Ingresa la dirección IP local de la computadora donde corre el sistema.")
            .setView(container)
            .setPositiveButton("Guardar y Conectar") { _, _ ->
                val newIp = input.text.toString().trim()
                if (newIp.isNotEmpty()) {
                    prefs.edit().putString(KEY_SERVER_IP, newIp).apply()
                    Toast.makeText(this, "Conectando a: $newIp...", Toast.LENGTH_SHORT).show()
                    errorLayout.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                    loadMeseroUrl()
                }
            }
            .setNeutralButton("Restablecer a 192.168.10.47") { _, _ ->
                prefs.edit().putString(KEY_SERVER_IP, DEFAULT_SERVER_IP).apply()
                Toast.makeText(this, "Restablecido a: $DEFAULT_SERVER_IP", Toast.LENGTH_SHORT).show()
                errorLayout.visibility = View.GONE
                webView.visibility = View.VISIBLE
                loadMeseroUrl()
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            if (backPressedTime + 2000 > System.currentTimeMillis()) {
                super.onBackPressed()
            } else {
                Toast.makeText(this, "Presiona de nuevo para salir de Mugrosito", Toast.LENGTH_SHORT).show()
                backPressedTime = System.currentTimeMillis()
            }
        }
    }
}
