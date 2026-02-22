import sys
from PIL import Image

def create_icons(source_path, dest_dir):
    try:
        img = Image.open(source_path)
        # Assuming the image is square or we simply resize it
        
        # 192x192
        img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
        img_192.save(f"{dest_dir}/icon-192x192.png")
        print("Created icon-192x192.png")
        
        # 512x512
        img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
        img_512.save(f"{dest_dir}/icon-512x512.png")
        print("Created icon-512x512.png")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate_icons.py <source_image> <dest_dir>")
        sys.exit(1)
    
    create_icons(sys.argv[1], sys.argv[2])
