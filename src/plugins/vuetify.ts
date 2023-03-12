/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
// import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'

// Composables
import {createVuetify, ThemeDefinition} from 'vuetify'

const theme: ThemeDefinition = {
  dark: false,
  colors: {
    background: '#F6E7E1',
    surface: 'F6E7E1',
    primary: '#FBDED0',
    'primary-darken-1': '#22005d',
    secondary: '#4A4E69',
    'secondary-darken-1': '#1e192b',
    accent: '#A9CCE3',
    error: '#B00020',
    info: '#2196F3',
    success: '#4CAF50',
    warning: '#FB8C00',
    white: '#fff',
    black: '#000'
  }
}

export default createVuetify({
  theme: {
    defaultTheme: 'theme',
    themes: {
      theme: theme,
    },
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
})
