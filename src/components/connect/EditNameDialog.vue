<template>
  <v-dialog :model-value="props.open" @close="() => $emit('close')" @update:modelValue="close">
    <v-card>
      <v-card-title class="text-h5">Change Name</v-card-title>

      <v-form ref="form">

        <v-card-text>
          <v-text-field :rules="rules" placeholder="BiggusDickus" label="Name" variant="outlined" v-model="name"/>
        </v-card-text>

        <v-card-actions>
          <v-spacer/>
          <v-btn
            color="error"
            variant="text"
            @click="() => $emit('close')"
          >
            Cancel
          </v-btn>
          <v-btn
            color="secondary"
            variant="text"
            @click="submit"
          >
            Change
          </v-btn>
        </v-card-actions>
      </v-form>

    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import {ref, watch} from 'vue';
import {VForm} from 'vuetify/components';
import {useAPI} from '@/service/api.service';
import {useAppStore} from '@/store/app.store';
import {useMessenger} from '@/service/messenger.service';
import {storeToRefs} from 'pinia';

const form = ref<VForm>();
const name = ref('');
const rules = [(value: string) => value === '' ? 'Please enter a user name' : true]
const {changeName} = useAPI();
const {user} = storeToRefs(useAppStore());
const {showMsg} = useMessenger();

const props = defineProps({
  open: Boolean
})


const emit = defineEmits(['close'])

function close(bool: boolean = false, resetName: boolean = true) {
  if (!bool) {
    emit('close')
    if (resetName) name.value = ''
  }
}

async function submit() {
  if (!form.value || !user.value) return;
  const res = await form.value.validate();
  if (!res.valid) return;
  try {
    close(false, false);
    await changeName({
      _id: user.value!._id,
      name: name.value
    })
    showMsg('success', 'Changed Name!');
    user.value.name = name.value;
    name.value = ''
  } catch (e) {
    showMsg('error', 'Something went wrong, try again later')
  }
}
</script>

<style scoped>

</style>
