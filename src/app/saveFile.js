// Fichiers de sauvegarde d'un entraînement (JSON). Dans Chrome / Edge, une vraie fenêtre
// « Enregistrer sous » permet de choisir le dossier et de modifier le nom ; le navigateur se
// souvient du dernier dossier utilisé. Ailleurs : téléchargement, puis ouverture par sélecteur de fichier.
const SaveFile = (() => {
  const PICKER_ID = 'darwin-gp';
  const TYPES = [{ description: 'Entraînement Darwin GP', accept: { 'application/json': ['.json'] } }];

  // Nom de fichier valide sous Windows, macOS et Linux, terminé par .json.
  function fileName(name) {
    const base = String(name ?? '').trim().replace(/\.json$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
      .replace(/^[.\s-]+|[.\s]+$/g, '');
    return `${base || 'entrainement'}.json`;
  }

  function download(text, suggestedName) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Enregistre data. Renvoie { name, where } ou null si l'utilisateur a annulé.
  async function save(data, name) {
    const text = JSON.stringify(data);
    const suggestedName = fileName(name);
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({ id: PICKER_ID, startIn: 'documents', suggestedName, types: TYPES });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        return { name: handle.name, where: 'dossier choisi' };
      } catch (error) {
        if (error.name === 'AbortError') return null;
        // Fenêtre refusée par le navigateur : on se rabat sur le téléchargement.
      }
    }
    download(text, suggestedName);
    return { name: suggestedName, where: 'Téléchargements' };
  }

  function pickWithInput() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', () => resolve(input.files[0] ?? null));
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  // Ouvre un fichier de sauvegarde. Renvoie { name, data } ou null si l'utilisateur a annulé.
  async function open() {
    let file = null;
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const [handle] = await window.showOpenFilePicker({ id: PICKER_ID, startIn: 'documents', types: TYPES });
        file = await handle.getFile();
      } catch (error) {
        if (error.name === 'AbortError') return null;
        file = await pickWithInput();
      }
    } else {
      file = await pickWithInput();
    }
    if (!file) return null;
    return { name: file.name, data: JSON.parse(await file.text()) };
  }

  return { fileName, save, open };
})();
