import { ref } from 'vue';

const x = ref(5);

export function getX() {
  return x.value;
}

export function add() {
  x.value += 1;
}
