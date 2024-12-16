<template>
  <div id="app">
    <KeyInputModal
        v-if="showKeyModal"
        :has-records="hasRecords"
        @confirm="handleKeyConfirm"
        @cancel="handleKeyCancel"
    />
    <PasswordTable
        v-if="!showKeyModal"
        :credentials="credentials"
        @add="addCredential"
        @edit="editCredential"
        @delete="deleteCredential"
        @export="exportCredentials"
    />
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import KeyInputModal from './components/KeyInputModal.vue';
import PasswordTable from './components/PasswordTable.vue';
import { ipcRenderer } from 'electron';

export default {
  components: { KeyInputModal, PasswordTable },
  setup() {
    const showKeyModal = ref(true);
    const hasRecords = ref(false);
    const credentials = ref([]);

    onMounted(async () => {
      try {
        hasRecords.value = await ipcRenderer.invoke('check-encrypt-keys');
      } catch (error) {
        console.error('Error checking keys:', error);
      }
    });

    const handleKeyConfirm = async (key) => {
      try {
        const projectId = await ipcRenderer.invoke('check-encryption-key', key);
        credentials.value = await ipcRenderer.invoke('load-credentials', projectId);
        showKeyModal.value = false;
      } catch (error) {
        alert(`密钥验证失败: ${error}`);
      }
    };

    const handleKeyCancel = () => {
      showKeyModal.value = false;
    };

    const addCredential = (credential) => {
      credentials.value.push(credential);
    };

    const editCredential = (updatedCredential) => {
      const index = credentials.value.findIndex(c => c.id === updatedCredential.id);
      if (index !== -1) {
        credentials.value[index] = updatedCredential;
      }
    };

    const deleteCredential = (id) => {
      credentials.value = credentials.value.filter(c => c.id !== id);
    };

    const exportCredentials = async (selectedCredentials) => {
      await ipcRenderer.invoke('export-to-csv', selectedCredentials);
    };

    return {
      showKeyModal,
      hasRecords,
      credentials,
      handleKeyConfirm,
      handleKeyCancel,
      addCredential,
      editCredential,
      deleteCredential,
      exportCredentials,
    };
  },
};
</script>
