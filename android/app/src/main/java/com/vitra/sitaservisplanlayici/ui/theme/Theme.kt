package com.vitra.sitaservisplanlayici.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// iOS tarafında kullanılan tint (0, 122, 255) ile aynı mavi.
val SitaBlue = Color(0xFF007AFF)

// Durum renkleri — masaüstü ve iOS ile aynı anlam: tamamlandı yeşil, acil kırmızı, uyarı turuncu.
val StatusGreen = Color(0xFF34C759)
val StatusOrange = Color(0xFFFF9500)
val StatusRed = Color(0xFFFF3B30)

// Tam renk şeması: eskiden yalnız ana renk tanımlıydı, geri kalan her şey Material'ın
// varsayılan mor/pembe tonlarında kalıyordu (pembemsi zemin, leylak "+" düğmesi ve
// sekme vurgusu). Yüzeyler artık iOS'taki gibi nötr: açık gri zemin, beyaz kartlar.
private val LightColors = lightColorScheme(
    primary = SitaBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCEBFF),
    onPrimaryContainer = Color(0xFF00325E),
    secondary = SitaBlue,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE3EEFF),
    onSecondaryContainer = Color(0xFF0A2A4A),
    tertiary = StatusGreen,
    onTertiary = Color.White,
    background = Color(0xFFF2F2F7),
    onBackground = Color(0xFF1C1C1E),
    surface = Color(0xFFF2F2F7),
    onSurface = Color(0xFF1C1C1E),
    surfaceVariant = Color(0xFFE9E9EE),
    onSurfaceVariant = Color(0xFF6C6C70),
    surfaceTint = Color.Transparent,
    outline = Color(0xFFC6C6C8),
    outlineVariant = Color(0xFFE5E5EA),
    error = StatusRed,
    onError = Color.White,
    errorContainer = Color(0xFFFFE5E3),
    onErrorContainer = Color(0xFF5F0B06),
    surfaceBright = Color.White,
    surfaceDim = Color(0xFFE5E5EA),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color.White,
    surfaceContainer = Color(0xFFF9F9FB),
    surfaceContainerHigh = Color.White,
    surfaceContainerHighest = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF0A84FF),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF0A3D7A),
    onPrimaryContainer = Color(0xFFDCEBFF),
    secondary = Color(0xFF0A84FF),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFF1F3550),
    onSecondaryContainer = Color(0xFFDCEBFF),
    tertiary = Color(0xFF30D158),
    onTertiary = Color.Black,
    background = Color.Black,
    onBackground = Color.White,
    surface = Color.Black,
    onSurface = Color.White,
    surfaceVariant = Color(0xFF2C2C2E),
    onSurfaceVariant = Color(0xFF8E8E93),
    surfaceTint = Color.Transparent,
    outline = Color(0xFF48484A),
    outlineVariant = Color(0xFF38383A),
    error = Color(0xFFFF453A),
    onError = Color.White,
    errorContainer = Color(0xFF5F0B06),
    onErrorContainer = Color(0xFFFFE5E3),
    surfaceBright = Color(0xFF2C2C2E),
    surfaceDim = Color.Black,
    surfaceContainerLowest = Color(0xFF0B0B0C),
    surfaceContainerLow = Color(0xFF1C1C1E),
    surfaceContainer = Color(0xFF121214),
    surfaceContainerHigh = Color(0xFF1C1C1E),
    surfaceContainerHighest = Color(0xFF1C1C1E),
)

@Composable
fun SitaYapiTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, content = content)
}
