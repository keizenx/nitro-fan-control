// Imports
const { ipcRenderer } = require('electron');

// Global variables
let temperatureChart = null;
let temperatureData = {
    labels: [],
    cpu: [],
    gpu: []
};
let chartTimeRange = 5; // minutes
let isManualMode = false;

// DOM Elements
const cpuTemp = document.getElementById('cpu-temp');
const cpuRpm = document.getElementById('cpu-rpm');
const cpuSpeed = document.getElementById('cpu-speed');
const cpuGauge = document.getElementById('cpu-gauge');
const cpuModel = document.getElementById('cpu-model');

const gpuTemp = document.getElementById('gpu-temp');
const gpuRpm = document.getElementById('gpu-rpm');
const gpuSpeed = document.getElementById('gpu-speed');
const gpuGauge = document.getElementById('gpu-gauge');
const gpuModel = document.getElementById('gpu-model');

const fanSlider = document.getElementById('fan-slider');
const cpuFanSlider = document.getElementById('cpu-fan-slider');
const gpuFanSlider = document.getElementById('gpu-fan-slider');
const sliderValue = document.getElementById('slider-value');
const cpuSliderValue = document.getElementById('cpu-slider-value');
const gpuSliderValue = document.getElementById('gpu-slider-value');

const statusValue = document.getElementById('status-value');
const modeToggle = document.getElementById('mode-toggle');
const modeLabel = document.getElementById('mode-label');
const profileButtons = document.querySelectorAll('.profile-btn');
const chartButtons = document.querySelectorAll('.chart-btn');

const resetBtn = document.getElementById('reset-btn');
const defaultBtn = document.getElementById('default-btn');
const refreshBtn = document.getElementById('refresh-btn');


// Window controls
document.getElementById('minimize-btn').addEventListener('click', () => ipcRenderer.send('window-minimize'));
document.getElementById('maximize-btn').addEventListener('click', () => ipcRenderer.send('window-maximize'));
document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('window-close'));


// Chart initialization
function initChart() {
    const ctx = document.getElementById('temp-chart').getContext('2d');
    
    temperatureChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                    label: 'CPU',
                    data: [],
                borderColor: 'var(--cpu-color)',
                    backgroundColor: 'rgba(255, 115, 0, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                tension: 0.4,
                    fill: true,
            }, {
                    label: 'GPU',
                    data: [],
                borderColor: 'var(--gpu-color)',
                    backgroundColor: 'rgba(0, 163, 255, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                tension: 0.4,
                    fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 400,
                easing: 'easeOutQuart',
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: 'var(--text-secondary)',
                        boxWidth: 15,
                        padding: 20,
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: 'var(--text-secondary)' }
                },
                y: {
                    min: 30,
                    max: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: 'var(--text-secondary)' }
                }
            }
        }
    });
}

// Update gauges
function updateGauge(gaugeElement, value, maxValue) {
    const percentage = Math.min(100, (value / maxValue) * 100);
    const degrees = (percentage / 100) * 360;
    let color = 'var(--accent)';
    if (gaugeElement.id.includes('cpu')) color = 'var(--cpu-color)';
    if (gaugeElement.id.includes('gpu')) color = 'var(--gpu-color)';
    
    gaugeElement.style.background = `conic-gradient(from 180deg, ${color} ${degrees}deg, rgba(255, 255, 255, 0.05) ${degrees}deg)`;
    }

    
// Update the UI with data
function updateUI(data) {
    if (!data) {
        statusValue.textContent = "Data Error";
        return;
    };
    
    // Update Models
    if (data.cpu?.model && cpuModel) cpuModel.textContent = data.cpu.model;
    if (data.gpu?.model && gpuModel) gpuModel.textContent = data.gpu.model;
    
    // Update CPU data
    if (data.cpu) {
        const cpuTempValue = data.cpu.temperature || 0;
        const cpuRpmValue = data.cpu.rpm || 0;
        const cpuSpeedValue = data.cpu.speed || 0;

        cpuTemp.textContent = `${cpuTempValue.toFixed(1)}°C`;
        cpuRpm.textContent = Math.round(cpuRpmValue).toLocaleString();
        cpuSpeed.textContent = `${Math.round(cpuSpeedValue)}%`;
        
        updateGauge(cpuGauge, cpuRpmValue, 8000); // Assuming 8000 RPM is max
        addTemperatureData('cpu', cpuTempValue);
    }
    
    // Update GPU data
    if (data.gpu) {
        const gpuTempValue = data.gpu.temperature || 0;
        const gpuRpmValue = data.gpu.rpm || 0;
        const gpuSpeedValue = data.gpu.speed || 0;

        gpuTemp.textContent = `${gpuTempValue.toFixed(1)}°C`;
        gpuRpm.textContent = Math.round(gpuRpmValue).toLocaleString();
        gpuSpeed.textContent = `${Math.round(gpuSpeedValue)}%`;
        
        updateGauge(gpuGauge, gpuRpmValue, 8000); // Assuming 8000 RPM is max
        addTemperatureData('gpu', gpuTempValue);
    }
    
    // Update Sliders if not in manual mode
    if (!isManualMode) {
        if (data.cpu?.speed !== undefined) {
            cpuFanSlider.value = data.cpu.speed;
            cpuSliderValue.textContent = `${Math.round(data.cpu.speed)}%`;
        }
        if (data.gpu?.speed !== undefined) {
            gpuFanSlider.value = data.gpu.speed;
            gpuSliderValue.textContent = `${Math.round(data.gpu.speed)}%`;
        }
        if (data.fanSpeed !== undefined) {
            fanSlider.value = data.fanSpeed;
            sliderValue.textContent = `${Math.round(data.fanSpeed)}%`;
        }
    }
    
    // Update status
    statusValue.textContent = data.status || 'Connected';
}

function addTemperatureData(type, value) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Limit data points
    const maxDataPoints = chartTimeRange * 60; // 5 minutes of data at 1 point per second
        
        if (temperatureData.labels.length > maxDataPoints) {
            temperatureData.labels.shift();
            temperatureData.cpu.shift();
            temperatureData.gpu.shift();
        }

    temperatureData.labels.push(timeStr);
    
    if (type === 'cpu') {
        temperatureData.cpu.push(value);
        temperatureData.gpu.push(null); // Push null to keep datasets aligned
    } else if (type === 'gpu') {
        temperatureData.gpu.push(value);
        temperatureData.cpu.push(null); // Push null to keep datasets aligned
    }
    
    updateChart();
}


function updateChart() {
    if (!temperatureChart) return;
    
    // Clean up nulls to avoid gaps in the chart
    const cleanCpuData = [];
    const cleanGpuData = [];
    let lastCpu = null;
    let lastGpu = null;

    for(let i = 0; i < temperatureData.labels.length; i++) {
        if(temperatureData.cpu[i] !== null) lastCpu = temperatureData.cpu[i];
        if(temperatureData.gpu[i] !== null) lastGpu = temperatureData.gpu[i];
        cleanCpuData.push(lastCpu);
        cleanGpuData.push(lastGpu);
    }
    
    temperatureChart.data.labels = temperatureData.labels;
    temperatureChart.data.datasets[0].data = cleanCpuData;
    temperatureChart.data.datasets[1].data = cleanGpuData;
    temperatureChart.update('none'); // Use 'none' for smoother updates
}

// Event Listeners
function setupEventListeners() {
    // Sliders
fanSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    sliderValue.textContent = `${value}%`;
});
fanSlider.addEventListener('change', (e) => {
        ipcRenderer.send('set-fan-speed', { speed: parseInt(e.target.value) });
});

cpuFanSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    cpuSliderValue.textContent = `${value}%`;
});
cpuFanSlider.addEventListener('change', (e) => {
        ipcRenderer.send('set-fan-speed', { fanId: 0, speed: parseInt(e.target.value) });
});

gpuFanSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    gpuSliderValue.textContent = `${value}%`;
});
gpuFanSlider.addEventListener('change', (e) => {
        ipcRenderer.send('set-fan-speed', { fanId: 1, speed: parseInt(e.target.value) });
});

    // Profile Buttons
profileButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        profileButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
            ipcRenderer.send('apply-profile', btn.dataset.profile);
    });
});

    // Mode Toggle
modeToggle.addEventListener('change', () => {
        isManualMode = modeToggle.checked;
        modeLabel.textContent = isManualMode ? 'Manual Mode' : 'Auto Mode';
        
        [fanSlider, cpuFanSlider, gpuFanSlider].forEach(slider => {
            slider.disabled = !isManualMode;
        });

        ipcRenderer.send('set-mode', isManualMode ? 'manual' : 'auto');
});

    // Control Buttons
resetBtn.addEventListener('click', () => {
    const value = 0;
    fanSlider.value = value;
    cpuFanSlider.value = value;
    gpuFanSlider.value = value;
    sliderValue.textContent = '0%';
    cpuSliderValue.textContent = '0%';
    gpuSliderValue.textContent = '0%';
    ipcRenderer.send('set-fan-speed', { speed: value });
});

defaultBtn.addEventListener('click', () => {
    const value = 50;
    fanSlider.value = value;
    cpuFanSlider.value = value;
    gpuFanSlider.value = value;
    sliderValue.textContent = '50%';
    cpuSliderValue.textContent = '50%';
    gpuSliderValue.textContent = '50%';
    ipcRenderer.send('set-fan-speed', { speed: value });
    });
    


    refreshBtn.addEventListener('click', () => {
        ipcRenderer.send('request-fan-status');
});

    // Chart Buttons
chartButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        chartButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        chartTimeRange = parseInt(btn.dataset.time);
            temperatureData = { labels: [], cpu: [], gpu: [] }; // Reset data
    });
});
}


// Listen for data from the main process
ipcRenderer.on('fan-data', (event, data) => {
    try {
        console.log("Data received:", data);
    updateUI(data);
    } catch (error) {
        console.error("Error updating UI:", error);
        statusValue.textContent = "UI Error";
}
});

ipcRenderer.on('hardware-info', (event, info) => {
    if (info.cpu && cpuModel) cpuModel.textContent = info.cpu;
    if (info.gpu && gpuModel) gpuModel.textContent = info.gpu;
});


// Initialization function
function initialize() {
    initChart();
    setupEventListeners();
    // Initial UI state
    modeToggle.checked = false; // Start in Auto mode
    [fanSlider, cpuFanSlider, gpuFanSlider].forEach(slider => {
        slider.disabled = true;
    });
    modeLabel.textContent = 'Auto Mode';
    
    // Request initial data
    ipcRenderer.send('request-fan-status');
    ipcRenderer.send('request-hardware-info');
}

// Run initialization on page load
document.addEventListener('DOMContentLoaded', initialize); 