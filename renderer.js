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
let updateInterval = null;
let lastCpuSpeed = 0;
let lastGpuSpeed = 0;

// DOM Elements
const cpuTemp = document.getElementById('cpu-temp');
const cpuRpm = document.getElementById('cpu-rpm');
const cpuSpeed = document.getElementById('cpu-speed');
const cpuGauge = document.getElementById('cpu-gauge');

const gpuTemp = document.getElementById('gpu-temp');
const gpuRpm = document.getElementById('gpu-rpm');
const gpuSpeed = document.getElementById('gpu-speed');
const gpuGauge = document.getElementById('gpu-gauge');

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

// Slider indicators
const masterSliderIndicator = document.querySelector('.slider-indicator.master');
const cpuSliderIndicator = document.querySelector('.slider-indicator.cpu');
const gpuSliderIndicator = document.querySelector('.slider-indicator.gpu');

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
                backgroundColor: 'rgba(255, 115, 0, 0.2)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3,
                fill: true,
            }, {
                label: 'GPU',
                data: [],
                borderColor: 'var(--gpu-color)',
                backgroundColor: 'rgba(0, 163, 255, 0.2)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 300,
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
                        padding: 15,
                        usePointStyle: true,
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1,
                }
            },
            scales: {
                x: {
                    grid: { 
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false,
                    },
                    ticks: { 
                        color: 'var(--text-secondary)',
                        maxRotation: 0,
                        maxTicksLimit: 8,
                    }
                },
                y: {
                    min: 30,
                    max: 100,
                    grid: { 
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false,
                    },
                    ticks: { 
                        color: 'var(--text-secondary)',
                        stepSize: 10,
                    }
                }
            }
        }
    });
}

// Update gauges - simple style like in the image
function updateGauge(gaugeElement, value, maxValue) {
    // No visual update for the gauge in this design
    // The gauges are simple circles with colored borders
    // We'll just update the text value inside
}

// Update slider indicators
function updateSliderIndicator(indicator, value) {
    indicator.style.width = `${value}%`;
}

// Update the UI with data
function updateUI(data) {
    if (!data) {
        statusValue.textContent = "Data Error";
        return;
    };

    // Update CPU data
    if (data.cpu) {
        const cpuTempValue = data.cpu.temperature || 0;
        const cpuRpmValue = data.cpu.rpm || 0;
        const cpuSpeedValue = data.cpu.speed || 0;

        cpuTemp.textContent = `${cpuTempValue.toFixed(1)}°C`;
        cpuRpm.textContent = Math.round(cpuRpmValue).toLocaleString();
        cpuSpeed.textContent = `${Math.round(cpuSpeedValue)}%`;

        // Update temperature chart
        addTemperatureData('cpu', cpuTempValue);
        
        // Update CPU slider indicator
        if (!isManualMode) {
            updateSliderIndicator(cpuSliderIndicator, cpuSpeedValue);
        }
        
        // Add high temperature warning
        if (cpuTempValue > 80) {
            cpuTemp.classList.add('high');
            cpuRpm.classList.add('high-temp');
        } else {
            cpuTemp.classList.remove('high');
            cpuRpm.classList.remove('high-temp');
        }
        
        lastCpuSpeed = cpuSpeedValue;
    }
    
    // Update GPU data
    if (data.gpu) {
        const gpuTempValue = data.gpu.temperature || 0;
        const gpuRpmValue = data.gpu.rpm || 0;
        const gpuSpeedValue = data.gpu.speed || 0;

        gpuTemp.textContent = `${gpuTempValue.toFixed(1)}°C`;
        gpuRpm.textContent = Math.round(gpuRpmValue).toLocaleString();
        gpuSpeed.textContent = `${Math.round(gpuSpeedValue)}%`;
        
        // Update temperature chart
        addTemperatureData('gpu', gpuTempValue);
        
        // Update GPU slider indicator
        if (!isManualMode) {
            updateSliderIndicator(gpuSliderIndicator, gpuSpeedValue);
        }
        
        // Add high temperature warning
        if (gpuTempValue > 75) {
            gpuTemp.classList.add('high');
            gpuRpm.classList.add('high-temp');
        } else {
            gpuTemp.classList.remove('high');
            gpuRpm.classList.remove('high-temp');
        }
        
        lastGpuSpeed = gpuSpeedValue;
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
            updateSliderIndicator(masterSliderIndicator, data.fanSpeed);
        }
    }
    
    // Update status
    statusValue.textContent = data.status || 'Connected';
}

function addTemperatureData(type, value) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Limit data points based on time range
    const maxDataPoints = chartTimeRange * 12; // Store data for the selected time range (at 5 sec intervals)

    if (temperatureData.labels.length > maxDataPoints) {
        temperatureData.labels.shift();
        temperatureData.cpu.shift();
        temperatureData.gpu.shift();
    }

    // Add new data point
    if (type === 'cpu') {
        temperatureData.labels.push(timeStr);
        temperatureData.cpu.push(value);
        
        // If we don't have GPU data for this timestamp, use the last known value
        if (temperatureData.gpu.length < temperatureData.labels.length) {
            const lastGpuTemp = temperatureData.gpu.length > 0 ? temperatureData.gpu[temperatureData.gpu.length - 1] : null;
            temperatureData.gpu.push(lastGpuTemp);
        }
    } else if (type === 'gpu') {
        // If we already have a label for this timestamp (from CPU data), don't add another
        if (temperatureData.labels.length > temperatureData.gpu.length) {
            temperatureData.gpu.push(value);
        } else {
            temperatureData.labels.push(timeStr);
            temperatureData.gpu.push(value);
            
            // If we don't have CPU data for this timestamp, use the last known value
            if (temperatureData.cpu.length < temperatureData.labels.length) {
                const lastCpuTemp = temperatureData.cpu.length > 0 ? temperatureData.cpu[temperatureData.cpu.length - 1] : null;
                temperatureData.cpu.push(lastCpuTemp);
            }
        }
    }

    updateChart();
}


function updateChart() {
    if (!temperatureChart) return;
    
    // Filter out any null values for a smoother chart
    const filteredData = {
        labels: [],
        cpu: [],
        gpu: []
    };
    
    // Keep only every nth point to avoid overcrowding the chart
    // The number depends on the time range
    const skipFactor = Math.max(1, Math.floor(temperatureData.labels.length / 60));
    
    for (let i = 0; i < temperatureData.labels.length; i += skipFactor) {
        filteredData.labels.push(temperatureData.labels[i]);
        filteredData.cpu.push(temperatureData.cpu[i]);
        filteredData.gpu.push(temperatureData.gpu[i]);
    }
    
    // Add the most recent point to ensure we're showing current data
    const lastIndex = temperatureData.labels.length - 1;
    if (lastIndex >= 0 && (lastIndex % skipFactor !== 0)) {
        filteredData.labels.push(temperatureData.labels[lastIndex]);
        filteredData.cpu.push(temperatureData.cpu[lastIndex]);
        filteredData.gpu.push(temperatureData.gpu[lastIndex]);
    }
    
    temperatureChart.data.labels = filteredData.labels;
    temperatureChart.data.datasets[0].data = filteredData.cpu;
    temperatureChart.data.datasets[1].data = filteredData.gpu;
    
    // Adjust Y axis based on temperature range
    const allTemps = [...filteredData.cpu, ...filteredData.gpu].filter(t => t !== null);
    if (allTemps.length > 0) {
        const minTemp = Math.max(30, Math.floor(Math.min(...allTemps) / 10) * 10 - 10);
        const maxTemp = Math.min(100, Math.ceil(Math.max(...allTemps) / 10) * 10 + 10);
        
        temperatureChart.options.scales.y.min = minTemp;
        temperatureChart.options.scales.y.max = maxTemp;
    }
    
    temperatureChart.update('none'); // Use 'none' for smoother updates
}

// Event Listeners
function setupEventListeners() {
    // Sliders
    fanSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        sliderValue.textContent = `${value}%`;
        updateSliderIndicator(masterSliderIndicator, value);
    });
    fanSlider.addEventListener('change', (e) => {
        ipcRenderer.send('set-fan-speed', { speed: parseInt(e.target.value) });
    });

    cpuFanSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        cpuSliderValue.textContent = `${value}%`;
        updateSliderIndicator(cpuSliderIndicator, value);
    });
    cpuFanSlider.addEventListener('change', (e) => {
        ipcRenderer.send('set-fan-speed', { fanId: 0, speed: parseInt(e.target.value) });
    });

    gpuFanSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        gpuSliderValue.textContent = `${value}%`;
        updateSliderIndicator(gpuSliderIndicator, value);
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
        
        updateSliderIndicator(masterSliderIndicator, value);
        updateSliderIndicator(cpuSliderIndicator, value);
        updateSliderIndicator(gpuSliderIndicator, value);
        
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
        
        updateSliderIndicator(masterSliderIndicator, value);
        updateSliderIndicator(cpuSliderIndicator, value);
        updateSliderIndicator(gpuSliderIndicator, value);
        
        ipcRenderer.send('set-fan-speed', { speed: value });
    });

    // Chart Buttons
    chartButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            chartButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            chartTimeRange = parseInt(btn.dataset.time);
            
            // Keep existing data but adjust the max points
            const maxDataPoints = chartTimeRange * 12;
            while (temperatureData.labels.length > maxDataPoints) {
                temperatureData.labels.shift();
                temperatureData.cpu.shift();
                temperatureData.gpu.shift();
            }
            
            updateChart();
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

// Setup auto-refresh
function setupAutoRefresh() {
    // Clear any existing interval
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    
    // Set up a new interval to request data every 5 seconds
    updateInterval = setInterval(() => {
        ipcRenderer.send('request-fan-status');
    }, 5000);
}

// Initialization function
function initialize() {
    initChart();
    setupEventListeners();
    setupAutoRefresh();
    
    // Initial UI state
    modeToggle.checked = false; // Start in Auto mode
    [fanSlider, cpuFanSlider, gpuFanSlider].forEach(slider => {
        slider.disabled = true;
    });
    modeLabel.textContent = 'Auto Mode';
    
    // Initialize slider indicators
    updateSliderIndicator(masterSliderIndicator, 0);
    updateSliderIndicator(cpuSliderIndicator, 0);
    updateSliderIndicator(gpuSliderIndicator, 0);
    
    // Request initial data
    ipcRenderer.send('request-fan-status');
}

// Run initialization on page load
document.addEventListener('DOMContentLoaded', initialize); 