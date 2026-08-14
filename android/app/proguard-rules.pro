# App-specific R8 rules only. Capacitor, Firebase, Google Play services,
# RevenueCat, Glide, Gson and Sentry all publish consumer rules with the exact
# reflective surfaces they require. Broad package-wide `-keep` rules here used
# to override those rules and disabled shrinking, class merging and method
# inlining for most of the native app.

# Match AGP 9.1's compact DEX layout while Capacitor 8 remains on AGP 8.13.
# Classes that must retain a stable name are already protected by manifest or
# library consumer rules.
-repackageclasses

# Keep useful error/warning logs while removing verbose production logging and
# its method-call overhead.
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}

# Firebase Authentication has optional Facebook-provider integration. The app
# does not ship the Facebook SDK, so those references are intentionally absent.
-dontwarn com.facebook.**

# Preserve generic signatures and runtime annotations used by JSON adapters and
# annotated plugin methods. The classes and members themselves remain eligible
# for shrinking and optimization.
-keepattributes Signature,*Annotation*
-keepclassmembers,allowoptimization,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
