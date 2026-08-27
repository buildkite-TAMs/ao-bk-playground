async function renderNasaImage() {
  const imageElement = document.getElementById('nasa-image');
  const videoElement = document.getElementById('nasa-video');
  const errorElement = document.getElementById('image-error');
  const loadingElement = document.getElementById('image-loading');
  const retryButton = document.getElementById('retry-image');
  const titleElement = document.getElementById('image-heading');
  const dateElement = document.getElementById('image-date');
  const explanationElement = document.getElementById('image-explanation');
  const attributionElement = document.getElementById('image-attribution');
  const highResLink = document.getElementById('high-res-link');
  const dateInput = document.getElementById('apod-date');

  if (!imageElement || !videoElement) {
    console.error('Unable to render NASA media: the image or video element was not found');
    return;
  }

  try {
    resetMedia(imageElement, videoElement);

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

    const apiUrl = new URL('/api/nasaimage', window.location.origin);

    if (dateInput?.value) {
      apiUrl.searchParams.set('date', dateInput.value);
    }

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    const nasaMedia = data.item;

    if (!nasaMedia) {
      throw new Error('The response did not contain NASA media');
    }

    await renderMedia(nasaMedia, imageElement, videoElement);
    renderImageDetails(nasaMedia, {
      titleElement,
      dateElement,
      explanationElement,
      attributionElement,
      highResLink
    });
    if (dateInput && nasaMedia.date) {
      dateInput.value = nasaMedia.date;
    }
  } catch (error) {
    resetMedia(imageElement, videoElement);

    if (errorElement) {
      errorElement.textContent = `Unable to load NASA media: ${error.message}`;
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

async function renderMedia(nasaMedia, imageElement, videoElement) {
  if (nasaMedia.mediaType === 'video') {
    const videoUrl = getSafeMediaUrl(nasaMedia.mediaUrl);

    if (!videoUrl) {
      throw new Error('The response did not contain a valid video URL');
    }

    videoElement.title = nasaMedia.title
      ? `${nasaMedia.title}, NASA Astronomy Picture of the Day video`
      : 'NASA Astronomy Picture of the Day video';
    await loadFrame(videoElement, videoUrl);
    videoElement.hidden = false;
    return;
  }

  const imageUrl = getSafeMediaUrl(nasaMedia.imageUrl);

  if (!imageUrl) {
    throw new Error('The response did not contain a valid image URL');
  }

  imageElement.alt = nasaMedia.title
    ? `${nasaMedia.title}, NASA Astronomy Picture of the Day`
    : 'NASA Astronomy Picture of the Day';
  await loadImage(imageElement, imageUrl);
  imageElement.hidden = false;
}

function resetMedia(imageElement, videoElement) {
  imageElement.hidden = true;
  imageElement.removeAttribute('src');
  videoElement.hidden = true;
  videoElement.removeAttribute('src');
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

  const actionUrl = nasaImage.mediaType === 'video'
    ? getSafeMediaUrl(nasaImage.mediaUrl)
    : getSafeMediaUrl(nasaImage.hdImageUrl);

  if (highResLink && actionUrl) {
    highResLink.href = actionUrl;
    highResLink.textContent = nasaImage.mediaType === 'video'
      ? 'Open video ↗'
      : 'View high-resolution image ↗';
    highResLink.hidden = false;
  }
}

function getSafeMediaUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
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

function loadFrame(frameElement, videoUrl) {
  return new Promise((resolve) => {
    frameElement.onload = resolve;
    frameElement.src = videoUrl;
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
