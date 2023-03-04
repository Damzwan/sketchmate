/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Composables
import {createVuetify, ThemeDefinition} from 'vuetify'

const theme: ThemeDefinition = {
  dark: false,
  colors: {
    background: '#FFDFD3',
    surface: '#FFDFD3',
    primary: '#6750a4',
    'primary-darken-1': '#22005d',
    secondary: '#625b71',
    'secondary-darken-1': '#1e192b',
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
    }
  }
})
