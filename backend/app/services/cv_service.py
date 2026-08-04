import json
from fastapi import HTTPException

def process_locally(tool_name: str, input_path: str, output_path: str, params: dict) -> dict:
    """Memproses gambar secara lokal menggunakan OpenCV di server."""
    import cv2
    import numpy as np

    img = cv2.imread(input_path)
    if img is None:
        raise HTTPException(status_code=422, detail="File gambar tidak dapat dibaca oleh OpenCV")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    result_img = img.copy()
    extra = {}

    if tool_name == "adaptive-thresh":
        block_size = int(params.get("blockSize", 11))
        c_val = int(params.get("C", 2))
        if block_size % 2 == 0:
            block_size += 1
        thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY, block_size, c_val)
        result_img = cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)

    elif tool_name == "contour":
        _, binary = cv2.threshold(gray, int(params.get("threshold", 127)), 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(result_img, contours, -1, (0, 255, 0), 2)

    elif tool_name == "sobel":
        ksize = int(params.get("ksize", 3))
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=ksize)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=ksize)
        magnitude = np.sqrt(sobelx**2 + sobely**2)
        magnitude = np.clip(magnitude / magnitude.max() * 255, 0, 255).astype(np.uint8)
        result_img = cv2.cvtColor(magnitude, cv2.COLOR_GRAY2BGR)

    elif tool_name == "morphology":
        kernel_size = int(params.get("kernelSize", 5))
        operation = params.get("operation", "dilate")
        kernel = np.ones((kernel_size, kernel_size), np.uint8)
        _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
        if operation == "erode":
            out = cv2.erode(binary, kernel, iterations=1)
        elif operation == "open":
            out = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        elif operation == "close":
            out = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        else:
            out = cv2.dilate(binary, kernel, iterations=1)
        contours, _ = cv2.findContours(out, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        result_img = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
        extra["stats"] = {"area_objects": len(contours), "kernel_size": kernel_size, "operation": operation}

    elif tool_name == "roi":
        x = int(params.get("x", 0))
        y = int(params.get("y", 0))
        w = int(params.get("w", img.shape[1] // 2))
        h = int(params.get("h", img.shape[0] // 2))
        roi = img[y:y+h, x:x+w]
        result_img = roi if roi.size > 0 else img

    elif tool_name == "calibrate":
        scale = float(params.get("scale", 1.0))
        h_new = int(img.shape[0] * scale)
        w_new = int(img.shape[1] * scale)
        result_img = cv2.resize(img, (w_new, h_new))

    elif tool_name == "color-split":
        channel = params.get("channel", "red").lower()
        b, g, r = cv2.split(img)
        zeros = np.zeros_like(b)
        if channel == "red":
            result_img = cv2.merge([zeros, zeros, r])
        elif channel == "green":
            result_img = cv2.merge([zeros, g, zeros])
        else:
            result_img = cv2.merge([b, zeros, zeros])

    elif tool_name == "colony-count":
        # Deteksi koloni dengan SimpleBlobDetector atau HoughCircles
        blurred = cv2.GaussianBlur(gray, (11, 11), 0)
        _, thresh = cv2.threshold(blurred, int(params.get("threshold", 100)), 255, cv2.THRESH_BINARY_INV)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        min_area = int(params.get("minArea", 50))
        valid_contours = [c for c in contours if cv2.contourArea(c) > min_area]
        for i, c in enumerate(valid_contours):
            M = cv2.moments(c)
            if M["m00"] != 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
                cv2.circle(result_img, (cx, cy), 10, (0, 0, 255), 2)
                cv2.putText(result_img, str(i+1), (cx-5, cy+5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0), 1)
        colony_count = len(valid_contours)
        extra["colonies"] = colony_count
        # Tulis juga JSON
        json_path = output_path.replace('.jpg', '.json').replace('.png', '.json')
        with open(json_path, 'w') as jf:
            json.dump({"colony_count": colony_count}, jf)

    else:
        # Default: grayscale
        result_img = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    cv2.imwrite(output_path, result_img)
    return extra
