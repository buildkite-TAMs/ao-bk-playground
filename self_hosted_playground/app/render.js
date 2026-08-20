async function renderNasaImage() {
  const imageElement = document.getElementById('nasa-image');
  const errorElement = document.getElementById('image-error');
  const loadingElement = document.getElementById('image-loading');
  const retryButton = document.getElementById('retry-image');
  const titleElement = document.getElementById('image-heading');
  const dateElement = document.getElementById('image-date');
  const explanationElement = document.getElementById('image-explanation');
  const attributionElement = document.getElementById('image-attribution');
  const highResLink = document.getElementById('high-res-link');
  const dateInput = document.getElementById('apod-date');

  if (!imageElement) {
    console.error('Unable to render NASA image: #nasa-image was not found');
    return;
  }

  try {
    imageElement.hidden = true;

    if (loadingElement) {
      loadingElement.hidden = false;
    }

    if (retryButton) {
      retryButton.hidden = true;
    }

    if (errorElement) {
      errorElement.textContent = '';
    }

    if (highResLink) {
      highResLink.hidden = true;
    }

    const apiUrl = new URL('http://localhost:3000/api/nasaimage');

    if (dateInput?.value) {
      apiUrl.searchParams.set('date', dateInput.value);
    }

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    const nasaImage = data.item;
    const imageUrl = nasaImage?.imageUrl;

    if (!imageUrl) {
      throw new Error('The response did not contain an image URL');
    }

    await loadImage(imageElement, imageUrl);
    renderImageDetails(nasaImage, {
      titleElement,
      dateElement,
      explanationElement,
      attributionElement,
      highResLink
    });
    if (dateInput && nasaImage.date) {
      dateInput.value = nasaImage.date;
    }
    imageElement.alt = nasaImage.title
      ? `${nasaImage.title}, NASA Astronomy Picture of the Day`
      : 'NASA Astronomy Picture of the Day';
    imageElement.hidden = false;
  } catch (error) {
    imageElement.removeAttribute('src');

    if (errorElement) {
      errorElement.textContent = `Unable to load NASA image: ${error.message}`;
    }

    console.error(error);
  } finally {
    if (loadingElement) {
      loadingElement.hidden = true;
    }

    if (retryButton) {
      retryButton.hidden = false;
    }
  }
}

function renderImageDetails(nasaImage, elements) {
  const {
    titleElement,
    dateElement,
    explanationElement,
    attributionElement,
    highResLink
  } = elements;

  if (titleElement) {
    titleElement.textContent = nasaImage.title || 'Astronomy Picture of the Day';
  }

  if (dateElement) {
    dateElement.dateTime = nasaImage.date || '';
    dateElement.textContent = formatDate(nasaImage.date);
  }

  if (explanationElement) {
    explanationElement.textContent = nasaImage.explanation || '';
  }

  if (attributionElement) {
    attributionElement.textContent = `Credit: ${nasaImage.attribution || 'NASA'}`;
    attributionElement.hidden = false;
  }

  if (highResLink && nasaImage.hdImageUrl) {
    highResLink.href = nasaImage.hdImageUrl;
    highResLink.hidden = false;
  }
}

function formatDate(date) {
  if (!date) {
    return '';
  }

  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function loadImage(imageElement, imageUrl) {
  return new Promise((resolve, reject) => {
    imageElement.onload = resolve;
    imageElement.onerror = () => reject(new Error('The image could not be displayed'));
    imageElement.src = imageUrl;
  });
}

document.addEventListener('DOMContentLoaded', renderNasaImage);
document.getElementById('retry-image')?.addEventListener('click', renderNasaImage);
document.getElementById('apod-date-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  renderNasaImage();
});

const dateInput = document.getElementById('apod-date');
if (dateInput) {
  dateInput.max = getLocalIsoDate(new Date());
}

function getLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
