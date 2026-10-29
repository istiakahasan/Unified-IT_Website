/* Moved out of partners.html so the Content-Security-Policy can forbid inline script. */
// 1. Ambient 3D Three.js Particle Background
try {
  const cv = document.getElementById('ptn-canvas');
  if (!cv) throw new Error('No canvas element');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 10;

  const N = (window.innerWidth < 768) ? 800 : 1600;
  const pos = new Float32Array(N * 3);
  const sd = new Float32Array(N);
  const sz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 32;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 18 - 2;
    sd[i] = Math.random();
    sz[i] = 0.5 + Math.random() * 1.8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPx: { value: renderer.getPixelRatio() },
      uTint: { value: new THREE.Color().setHSL(190 / 360, 0.8, 0.65) }
    },
    vertexShader: `
      attribute float aSeed;
      attribute float aSize;
      uniform float uTime, uPx;
      varying float vTw;
      void main() {
        vec3 p = position;
        float sp = 0.15 + aSeed * 0.45;
        p.y = mod(p.y - uTime * sp + 9.0, 18.0) - 9.0;
        p.x += sin(uTime * 0.3 + aSeed * 18.0) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vTw = pow(0.5 + 0.5 * sin(uTime * (1.2 + aSeed * 3.0)), 4.0);
        gl_PointSize = aSize * (1.0 + vTw * 1.5) * (30.0 / -mv.z) * uPx;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uTint;
      varying float vTw;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float gl = smoothstep(0.5, 0.0, d);
        vec3 col = mix(uTint, vec3(0.9, 0.98, 1.0), vTw * 0.7);
        float a = gl * gl * 0.55;
        gl_FragColor = vec4(col * a, a);
      }
    `
  });
  scene.add(new THREE.Points(geo, mat));

  function onResize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize, { passive: true });
  onResize();

  const clock = new THREE.Clock();
  function renderLoop() {
    requestAnimationFrame(renderLoop);
    if (document.hidden) return;
    mat.uniforms.uTime.value = clock.getElapsedTime();
    mat.uniforms.uPx.value = renderer.getPixelRatio();
    renderer.render(scene, camera);
  }
  renderLoop();
} catch (e) {
  console.warn('[ThreeJS ambient background]', e);
}

// 2. Interactive Tier Profit / Margin Calculator
(function () {
  const spendSlider = document.getElementById('calc-spend-slider');
  const clientsSlider = document.getElementById('calc-clients-slider');
  const spendLabel = document.getElementById('calc-spend-label');
  const clientsLabel = document.getElementById('calc-clients-label');

  const tierQualifiedEl = document.getElementById('calc-tier-qualified');
  const discountPctEl = document.getElementById('calc-discount-pct');
  const monthlySavingsEl = document.getElementById('calc-monthly-savings');
  const annualProfitEl = document.getElementById('calc-annual-profit');

  function updateCalc() {
    const spend = Number(spendSlider.value);
    const clients = Number(clientsSlider.value);

    spendLabel.textContent = `৳${spend.toLocaleString()} / month`;
    clientsLabel.textContent = `${clients} Clients`;

    let tierName = 'Registered Partner';
    let discount = 0.05;

    if (spend >= 360000) {
      tierName = 'Platinum Partner';
      discount = 0.20;
    } else if (spend >= 120000) {
      tierName = 'Gold Partner';
      discount = 0.15;
    } else if (spend >= 30000) {
      tierName = 'Silver Partner';
      discount = 0.10;
    }

    const monthlySavings = spend * discount;
    const annualSavings = monthlySavings * 12;

    tierQualifiedEl.textContent = tierName;
    discountPctEl.textContent = `${Math.round(discount * 100)}%`;
    monthlySavingsEl.textContent = `৳${Math.round(monthlySavings).toLocaleString()}`;
    annualProfitEl.textContent = `৳${Math.round(annualSavings).toLocaleString()}`;
  }

  spendSlider.addEventListener('input', updateCalc);
  clientsSlider.addEventListener('input', updateCalc);
  updateCalc();
})();

// 3. Application Form Submission Handler & Dropzone Logic
(function () {
  const form = document.getElementById('partner-apply-form');
  const feedback = document.getElementById('form-feedback');
  const submitBtn = document.getElementById('submit-btn');

  // Dropzone Wiring Helper
  function setupDropzone(inputId, dropzoneId, placeholderId, selectedId, nameId, sizeId, removeId) {
    const input = document.getElementById(inputId);
    const dropzone = document.getElementById(dropzoneId);
    const placeholder = document.getElementById(placeholderId);
    const selected = document.getElementById(selectedId);
    const nameEl = document.getElementById(nameId);
    const sizeEl = document.getElementById(sizeId);
    const removeBtn = document.getElementById(removeId);

    dropzone.addEventListener('click', (e) => {
      if (e.target !== removeBtn) input.click();
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--ptn-cyan)';
      dropzone.style.background = 'rgba(93, 224, 196, 0.08)';
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = input.files.length ? 'var(--ptn-cyan)' : 'rgba(255,255,255,0.25)';
      dropzone.style.background = 'rgba(0,0,0,0.35)';
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.background = 'rgba(0,0,0,0.35)';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change'));
      }
    });

    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        const f = input.files[0];
        if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
          alert('Invalid document format. Only PDF files (.pdf) are accepted.');
          input.value = '';
          placeholder.style.display = 'block';
          selected.style.display = 'none';
          dropzone.style.borderColor = 'rgba(255,255,255,0.25)';
          return;
        }
        nameEl.textContent = f.name;
        sizeEl.textContent = `${(f.size / 1024).toFixed(1)} KB`;
        placeholder.style.display = 'none';
        selected.style.display = 'flex';
        dropzone.style.borderColor = 'var(--ptn-cyan)';
      } else {
        placeholder.style.display = 'block';
        selected.style.display = 'none';
        dropzone.style.borderColor = 'rgba(255,255,255,0.25)';
      }
    });

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      placeholder.style.display = 'block';
      selected.style.display = 'none';
      dropzone.style.borderColor = 'rgba(255,255,255,0.25)';
      input.click();
    });

    return () => {
      input.value = '';
      placeholder.style.display = 'block';
      selected.style.display = 'none';
      dropzone.style.borderColor = 'rgba(255,255,255,0.25)';
    };
  }

  const resetTL = setupDropzone('tradeLicense', 'tradeLicense-dropzone', 'tradeLicense-placeholder', 'tradeLicense-selected', 'tradeLicense-name', 'tradeLicense-size', 'tradeLicense-remove');
  const resetNID = setupDropzone('nidDocument', 'nidDocument-dropzone', 'nidDocument-placeholder', 'nidDocument-selected', 'nidDocument-name', 'nidDocument-size', 'nidDocument-remove');

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read ' + file.name));
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    feedback.className = 'ptn-form-status';
    feedback.style.display = 'none';

    const services = Array.from(document.querySelectorAll('input[name="services"]:checked')).map(el => el.value);
    if (services.length === 0) {
      feedback.textContent = 'Please select at least one service of interest.';
      feedback.className = 'ptn-form-status error';
      feedback.style.display = 'block';
      return;
    }

    const tlInput = document.getElementById('tradeLicense');
    const nidInput = document.getElementById('nidDocument');

    if (!tlInput.files || tlInput.files.length === 0) {
      feedback.textContent = 'Trade License (PDF) is mandatory. Please upload your Trade License in PDF format.';
      feedback.className = 'ptn-form-status error';
      feedback.style.display = 'block';
      return;
    }

    if (!nidInput.files || nidInput.files.length === 0) {
      feedback.textContent = 'National ID / NID (PDF) is mandatory. Please upload your NID document in PDF format.';
      feedback.className = 'ptn-form-status error';
      feedback.style.display = 'block';
      return;
    }

    const tlFile = tlInput.files[0];
    const nidFile = nidInput.files[0];

    if (!tlFile.name.toLowerCase().endsWith('.pdf') && tlFile.type !== 'application/pdf') {
      feedback.textContent = 'Trade License must be an uploaded PDF file (.pdf).';
      feedback.className = 'ptn-form-status error';
      feedback.style.display = 'block';
      return;
    }

    if (!nidFile.name.toLowerCase().endsWith('.pdf') && nidFile.type !== 'application/pdf') {
      feedback.textContent = 'National ID document must be an uploaded PDF file (.pdf).';
      feedback.className = 'ptn-form-status error';
      feedback.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Encoding & Uploading Documents...';

    try {
      const [tlData, nidData] = await Promise.all([
        readFileAsDataUrl(tlFile),
        readFileAsDataUrl(nidFile)
      ]);

      const payload = {
        fullName: document.getElementById('fullName').value,
        businessName: document.getElementById('businessName').value,
        businessEmail: document.getElementById('businessEmail').value,
        phoneNumber: document.getElementById('phoneNumber').value,
        country: document.getElementById('country').value,
        websiteUrl: document.getElementById('websiteUrl').value,
        businessType: document.getElementById('businessType').value,
        estimatedMonthlySpend: document.getElementById('estimatedMonthlySpend').value,
        expectedCustomers: document.getElementById('expectedCustomers').value,
        partnershipModel: document.getElementById('partnershipModel').value,
        servicesOfInterest: services,
        businessDescription: document.getElementById('businessDescription').value,
        agreeTerms: document.getElementById('agreeTerms').checked,
        tradeLicense: {
          name: tlFile.name,
          data: tlData,
          size: tlFile.size
        },
        nidDocument: {
          name: nidFile.name,
          data: nidData,
          size: nidFile.size
        }
      };

      submitBtn.textContent = 'Submitting Application...';

      const res = await fetch('/api/public/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.message || 'Submission failed');
      }

      feedback.innerHTML = `
        <strong>Application Received Successfully!</strong><br>
        Reference Number: <b style="color:var(--ptn-cyan); font-size:16px;">${data.referenceNo}</b><br>
        ${data.message}<br>
        Trade License &amp; NID verification documents have been securely attached to your application.
      `;
      feedback.className = 'ptn-form-status success';
      feedback.style.display = 'block';
      form.reset();
      resetTL();
      resetNID();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'ptn-form-status error';
      feedback.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Partner Application';
    }
  });
})();
