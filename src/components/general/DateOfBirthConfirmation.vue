<template>
  <ion-modal
    :is-open="dateOfBirthConfirmationOpen"
    @didDismiss="() => {
      dateOfBirthConfirmationOpen=false
      cancel()
    }"
    @willPresent="sentResponse = false"
    class="dob-modal"
  >
    <div class="p-4 flex flex-col gap-2">
      <p class="text-xl cabin-sketch-regular text-center font-semibold">
        Confirm Age for Social Features
      </p>

      <!-- Safety Information with border -->
      <div class="p-2 rounded-md shadow-sm  overflow-y-auto cabin-sketch-regular border border-gray-400">
        <p>Please read carefully before continuing:</p>
        <ul class="list-disc ml-4">
          <li>Do not share personal information with strangers online.</li>
          <li>Be respectful to others at all times.</li>
          <li>Do not post inappropriate or offensive content.</li>
          <li>Remember that anything you share online can be permanent.</li>
        </ul>
      </div>

      <!-- Date of Birth Picker with label -->
      <div class="flex flex-col items-center gap-2">
        <label for="datetime" class="font-medium cabin-sketch-regular">
          Date of Birth:
        </label>
        <ion-datetime
          v-model="dateTimeValue"
          id="datetime"
          color="secondary"
          presentation="month-year"
          class="rounded-lg shadow-md border border-gray-400 w-56"
          :min="minDate"
          :max="maxDate"
          display-format="YYYY-MM-DD"
          picker-format="YYYY-MM-DD"
        />
      </div>

    </div>

    <div class="modal-footer">
      <ion-button fill="clear" color="medium" @click="cancel">
        Cancel
      </ion-button>
      <ion-button color="secondary" fill="clear" @click="confirm" :disabled="!dateTimeValue || sentResponse">
        Confirm
      </ion-button>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonDatetime, IonModal, IonButton } from '@ionic/vue'
import { ref } from 'vue'

import { storeToRefs } from 'pinia'
import { useMenuStore } from '@/store/draw/menu.store'

const { dateOfBirthConfirmationOpen } = storeToRefs(useMenuStore())

const minDate = '1900-01-01'
const maxDate = new Date().toISOString().split('T')[0]

const dateTimeValue = ref<string>()
const sentResponse = ref(false)

const cancel = () => {
  if (sentResponse.value) return
  document.dispatchEvent(
    new CustomEvent('dateofbirth-response', { detail: { response: null } })
  )
  dateOfBirthConfirmationOpen.value = false
  sentResponse.value = true
}

const confirm = () => {
  if (sentResponse.value) return
  if (!dateTimeValue.value) {
    return
  }
  document.dispatchEvent(
    new CustomEvent('dateofbirth-response', { detail: { response: new Date(dateTimeValue.value) } })
  )

  dateOfBirthConfirmationOpen.value = false
  sentResponse.value = true
}
</script>

<style scoped>
ion-modal {
  --width: fit-content;
  --min-width: 250px;
  --max-width: 80%;
  --height: fit-content;
  --background: var(--ion-color-tertiary);
  border-radius: 16px;
  padding: 0;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  padding: 1rem;
}

ion-datetime {
  --background: var(--ion-color-tertiary);
  --background-rgb: var(--ion-color-light);
}
</style>
