import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ninja.sketchmate.app',
  appName: 'SketchMate',
  webDir: 'dist',
  bundledWebRuntime: false,
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#488AFF',
      sound: 'beep.wav'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
}

export default config
