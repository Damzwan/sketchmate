import { CapacitorConfig } from '@capacitor/cli'
import { KeyboardResize } from '@capacitor/keyboard'

const config: CapacitorConfig = {
  appId: 'ninja.sketchmate.app',
  appName: 'SketchMate',
  backgroundColor: '#FFF2E4',
  webDir: 'dist',
  ios: {},
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_name'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    SplashScreen: {
      launchAutoHide: false
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com', 'phone']
    },
    Keyboard: {
      resize: KeyboardResize.None,
      resizeOnFullScreen: false

    },
    StatusBar: {
      style: 'LIGHT'
    }
  }
}

export default config
