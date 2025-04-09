// images.js
export async function preloadImages() {
    console.log('preloadImages вызвана');
    const imagePaths = [
      'access/images/melodyTop1_normal.png',
      'access/images/melodyTop1_pressed.png',
      'access/images/melodyTop2_normal.png',
      'access/images/melodyTop2_pressed.png',
      'access/images/melodyTop3_normal.png',
      'access/images/melodyTop3_pressed.png',
      'access/images/send_normal.png',
      'access/images/send_pressed.png',
    ];
  
    imagePaths.forEach(path => {
      const img = new Image();
      img.src = path;
      imageCache.set(path, img);
    });
  }
  
  export function toggleButtonImage(button, isPressed) {
    console.log('toggleButtonImage вызвана, isPressed:', isPressed);
    const baseSrc = button.dataset.baseSrc;
    if (!baseSrc) {
      console.error('dataset.baseSrc не задан для кнопки:', button);
      return;
    }
    const newSrc = isPressed ? `${baseSrc}_pressed.png` : `${baseSrc}_normal.png`;
    button.src = imageCache.has(newSrc) ? imageCache.get(newSrc).src : newSrc;
  }