import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ninja.sketchmate.app',
  appName: 'SketchMate',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_name'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    SplashScreen: {
      launchAutoHide: false
    }
  }
}

export default config
