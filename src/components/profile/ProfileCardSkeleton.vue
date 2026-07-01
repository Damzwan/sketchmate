<template>
  <section
    class="rounded-[3rem] border-2 border-primary/20 bg-primary/5 shadow-lg relative px-2 pb-2 pt-4"
  >
    <!-- top-right action buttons -->
    <div class="absolute top-0 right-0 flex items-center gap-1 z-50 p-2">
      <div class="w-10 h-10 rounded-full bg-primary/15 animate-pulse"></div>
      <div class="w-10 h-10 rounded-full bg-primary/15 animate-pulse"></div>
      <div class="w-10 h-10 rounded-full bg-primary/15 animate-pulse"></div>
    </div>

    <div class="flex flex-col items-center relative mt-2">
      <div class="relative w-full flex flex-col items-center py-6">
        <!-- avatar (xl = 128px) -->
        <div class="relative z-30 mb-6">
          <div class="w-32 h-32 rounded-[2.5rem] bg-primary/20 animate-pulse shadow-sm"></div>
        </div>

        <div class="text-center mt-4 w-full flex flex-col items-center">
          <!-- title badge -->
          <div class="h-6 w-28 rounded-full bg-primary/15 animate-pulse mb-2"></div>
          <!-- name -->
          <div class="h-8 w-48 rounded-xl bg-primary/20 animate-pulse"></div>
          <!-- description -->
          <div class="mt-4 h-4 w-64 rounded-md bg-primary/10 animate-pulse"></div>
          <div class="mt-2 h-4 w-40 rounded-md bg-primary/10 animate-pulse"></div>
        </div>
      </div>

      <!-- stats row -->
      <div class="grid grid-cols-3 w-full mt-6 border-t border-primary/15 pt-4">
        <div v-for="i in 3" :key="i" class="flex flex-col items-center gap-2">
          <div class="h-6 w-10 rounded-md bg-primary/20 animate-pulse"></div>
          <div class="h-2.5 w-14 rounded bg-primary/10 animate-pulse"></div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts"></script>
