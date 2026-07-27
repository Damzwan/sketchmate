# R8 / ProGuard rules.
#
# R8 is enabled in app/build.gradle (`minifyEnabled true`). Capacitor resolves
# plugins and bridges JS<->native almost entirely through REFLECTION and
# annotations, none of which R8 can see, so every reflective surface has to be
# kept explicitly or the app compiles fine and then fails at runtime with
# "Plugin not found" / missing-method errors that only appear in a release
# build.
#
# Any new native plugin needs its package added below.

# --- WebView JS bridge -------------------------------------------------------
# Every @JavascriptInterface method is called by name from JS.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# --- Capacitor core + plugin discovery ---------------------------------------
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
}
-keep class * extends com.getcapacitor.Plugin { *; }

# Cordova plugins bridged through Capacitor's compat layer.
-keep class org.apache.cordova.** { *; }

# --- App code ----------------------------------------------------------------
# MainActivity, the FCM service and the widget provider are all referenced from
# the manifest by name.
-keep class ninja.sketchmate.app.** { *; }

# --- Firebase / GMS ----------------------------------------------------------
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Gson serialises via reflection on field names; obfuscating them breaks the
# wire format. Keep annotations and any model fields it touches.
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# --- Readable crash reports --------------------------------------------------
# Without these, Play Console stack traces for 0.4.3-style native/Java crashes
# come back obfuscated and useless. Upload the mapping.txt with each release.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
