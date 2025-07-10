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
let animationSpeed = 0;
let currentProfile = 'Balanced';
let isDynamicMode = false;
let fanData = null;

// DOM Elements
const fanAnimation = document.getElementById('fan-animation');
const fanSlider = document.getElementById('fan-slider');
const cpuFanSlider = document.getElementById('cpu-fan-slider');
const gpuFanSlider = document.getElementById('gpu-fan-slider');
const sliderValue = document.getElementById('slider-value');
const cpuSliderValue = document.getElementById('cpu-slider-value');
const gpuSliderValue = document.getElementById('gpu-slider-value');
const cpuTemp = document.getElementById('cpu-temp');
const cpuGauge = document.getElementById('cpu-gauge');
const cpuSpeed = document.getElementById('cpu-speed');
const cpuModel = document.getElementById('cpu-model');
const gpuTemp = document.getElementById('gpu-temp');
const gpuGauge = document.getElementById('gpu-gauge');
const gpuSpeed = document.getElementById('gpu-speed');
const gpuModel = document.getElementById('gpu-model');
const statusValue = document.getElementById('status-value');
const modeToggle = document.getElementById('mode-toggle');
const modeLabel = document.getElementById('mode-label');
const profileButtons = document.querySelectorAll('.profile-btn');
const resetBtn = document.getElementById('reset-btn');
const defaultBtn = document.getElementById('default-btn');
const chartButtons = document.querySelectorAll('.chart-btn');

// Window controls
document.getElementById('minimize-btn').addEventListener('click', () => {
    ipcRenderer.send('window-minimize');
});

document.getElementById('maximize-btn').addEventListener('click', () => {
    ipcRenderer.send('window-maximize');
});

document.getElementById('close-btn').addEventListener('click', () => {
    ipcRenderer.send('window-close');
});

// Chart initialization
function initChart() {
    const ctx = document.getElementById('temp-chart').getContext('2d');
    
    temperatureChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'CPU',
                    data: [],
                    borderColor: '#FF7300',
                    backgroundColor: 'rgba(255, 115, 0, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'GPU',
                    data: [],
                    borderColor: '#00A3FF',
                    backgroundColor: 'rgba(0, 163, 255, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#AAAAAA'
                    }
                },
                y: {
                    min: 30,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#AAAAAA'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#FFFFFF'
                    }
                }
            }
        }
    });
}

// Update gauges
function updateGauge(gaugeElement, value, maxValue) {
    const percentage = (value / maxValue) * 100;
    const valueElement = gaugeElement.querySelector('.gauge-value');
    const prevValue = valueElement.dataset.prevValue ? parseInt(valueElement.dataset.prevValue) : 0;
    
    // Add an animation if the value changes significantly
    if (Math.abs(prevValue - value) > maxValue * 0.05) { // 5% change
        valueElement.classList.add('fan-speed-change');
        setTimeout(() => valueElement.classList.remove('fan-speed-change'), 800);
    }
    
    // Format the RPM value with a thousands separator
    const formattedValue = Math.round(value).toLocaleString();
    valueElement.textContent = formattedValue;
    valueElement.dataset.prevValue = value;
    valueElement.classList.add('rpm-value');
    
    // Update the percentage for CSS
    gaugeElement.style.setProperty('--percentage', `${percentage}%`);
    
    // Apply appropriate classes based on gauge type
    if (gaugeElement.classList.contains('cpu')) {
        gaugeElement.style.background = `radial-gradient(circle, var(--bg-secondary) 65%, transparent 66%), conic-gradient(var(--cpu-color) ${percentage * 3.6}deg, rgba(255, 115, 0, 0.2) ${percentage * 3.6}deg)`;
    } else if (gaugeElement.classList.contains('gpu')) {
        gaugeElement.style.background = `radial-gradient(circle, var(--bg-secondary) 65%, transparent 66%), conic-gradient(var(--gpu-color) ${percentage * 3.6}deg, rgba(0, 163, 255, 0.2) ${percentage * 3.6}deg)`;
    }
    
    // Add visual effects based on the value
    if (percentage > 80) {
        gaugeElement.classList.add('active');
        if (gaugeElement.classList.contains('cpu')) {
            gaugeElement.classList.add('cpu-active');
        } else if (gaugeElement.classList.contains('gpu')) {
            gaugeElement.classList.add('gpu-active');
        }
    } else {
        gaugeElement.classList.remove('active', 'cpu-active', 'gpu-active');
    }
    
    // Update the associated fan ring animation
    const fanRing = gaugeElement.parentNode.querySelector('.fan-ring');
    if (fanRing) {
        if (value > 0) {
            const speed = Math.max(0.5, 3 - (value / maxValue) * 2.5); // Limit minimum speed
            fanRing.style.animationDuration = `${speed}s`;
            fanRing.style.animationPlayState = 'running';
        } else {
            fanRing.style.animationPlayState = 'paused';
        }
    }
}

// Update the UI with data
function updateUI(data) {
    if (!data) return;
    
    fanData = data;
    
    // Update CPU data
    if (data.cpu) {
        // Update temperature with decimal precision
        const cpuTempValue = data.cpu.temperature;
        const cpuTempDisplay = cpuTempValue.toFixed(1);
        
        // Store the previous value for animation
        const prevCpuTemp = cpuTemp.dataset.prevTemp ? parseFloat(cpuTemp.dataset.prevTemp) : cpuTempValue;
        
        // Add a class for animation if the temperature changes significantly
        if (Math.abs(prevCpuTemp - cpuTempValue) > 0.2) {
            cpuTemp.classList.add('temp-pulse');
            setTimeout(() => cpuTemp.classList.remove('temp-pulse'), 500);
        }
        
        // Update temperature
        cpuTemp.textContent = `${cpuTempDisplay}°C`;
        cpuTemp.dataset.prevTemp = cpuTempValue;
        
        // Apply classes for high temperatures
        if (cpuTempValue > 75) {
            cpuTemp.classList.add('high-temp');
            document.querySelector('.card.cpu')?.classList.add('warning');
        } else {
            cpuTemp.classList.remove('high-temp');
            document.querySelector('.card.cpu')?.classList.remove('warning');
        }
        
        cpuTemp.style.backgroundColor = getTemperatureColor(cpuTempValue);
        
        // Update RPM and gauge
        const cpuRpmValue = data.cpu.rpm || 0;
        
        // Ensure the CPU gauge has the appropriate class
        if (!cpuGauge.classList.contains('cpu')) {
            cpuGauge.classList.add('cpu');
        }
        
        updateGauge(cpuGauge, cpuRpmValue, 8000);
        
        // Update speed
        const cpuSpeedValue = Math.round(data.cpu.speed);
        cpuSpeed.textContent = `${cpuSpeedValue}%`;
        
        // Add data to the chart
        addTemperatureData('cpu', cpuTempValue);
        
        // Update CPU fan animation
        const cpuFanAnimation = document.querySelector('.fan-animation.cpu-fan');
        if (cpuFanAnimation) {
            if (cpuRpmValue > 0) {
                cpuFanAnimation.classList.add('cpu-active');
            } else {
                cpuFanAnimation.classList.remove('cpu-active');
            }
        }
    }
    
    // Update GPU data
    if (data.gpu) {
        // Update temperature with decimal precision
        const gpuTempValue = data.gpu.temperature;
        const gpuTempDisplay = gpuTempValue.toFixed(1);
        
        // Store the previous value for animation
        const prevGpuTemp = gpuTemp.dataset.prevTemp ? parseFloat(gpuTemp.dataset.prevTemp) : gpuTempValue;
        
        // Add a class for animation if the temperature changes significantly
        if (Math.abs(prevGpuTemp - gpuTempValue) > 0.2) {
            gpuTemp.classList.add('temp-pulse');
            setTimeout(() => gpuTemp.classList.remove('temp-pulse'), 500);
        }
        
        // Apply classes for high temperatures
        if (gpuTempValue > 80) {
            gpuTemp.classList.add('high-temp');
            document.querySelector('.card.gpu')?.classList.add('warning');
        } else {
            gpuTemp.classList.remove('high-temp');
            document.querySelector('.card.gpu')?.classList.remove('warning');
        }
        
        // Update temperature
        gpuTemp.textContent = `${gpuTempDisplay}°C`;
        gpuTemp.dataset.prevTemp = gpuTempValue;
        gpuTemp.style.backgroundColor = getTemperatureColor(gpuTempValue);
        
        // Update RPM and gauge
        const gpuRpmValue = data.gpu.rpm || 0;
        updateGauge(gpuGauge, gpuRpmValue, 8000);
        
        // Update speed
        const gpuSpeedValue = Math.round(data.gpu.speed);
        gpuSpeed.textContent = `${gpuSpeedValue}%`;
        
        // Add data to the chart
        addTemperatureData('gpu', gpuTempValue);
    }
    
    // If in dynamic mode, update the slider
    if (isDynamicMode && data.fanSpeed !== undefined) {
        const fanSpeedValue = Math.round(data.fanSpeed);
        fanSlider.value = fanSpeedValue;
        sliderValue.textContent = `${fanSpeedValue}%`;
        
        // Sync other sliders
        cpuFanSlider.value = fanSpeedValue;
        gpuFanSlider.value = fanSpeedValue;
        cpuSliderValue.textContent = `${fanSpeedValue}%`;
        gpuSliderValue.textContent = `${fanSpeedValue}%`;
    }
    
    // Update status
    statusValue.textContent = data.status || 'Connected';
}

// Function to get a color based on temperature
function getTemperatureColor(temp) {
    if (temp < 40) return 'var(--accent)'; // Normal red for consistency
    if (temp < 60) return '#ff6000'; // Orange
    if (temp < 75) return '#ff3000'; // Orange-red
    return '#ff0000'; // Bright red for high temperatures
}

// Add data to the chart
function addTemperatureData(type, value) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    
    // Only add a new time entry if it's the first data point or a new second
    if (temperatureData.labels.length === 0 || temperatureData.labels[temperatureData.labels.length - 1] !== timeStr) {
        temperatureData.labels.push(timeStr);
        
        // Limit data to the selected time range (in seconds)
        const maxDataPoints = chartTimeRange * 60;
        if (temperatureData.labels.length > maxDataPoints) {
            temperatureData.labels.shift();
            temperatureData.cpu.shift();
            temperatureData.gpu.shift();
        }
    }
    
    // Add temperatures
    if (type === 'cpu') {
        temperatureData.cpu.push(value);
        while (temperatureData.cpu.length < temperatureData.labels.length) {
            temperatureData.cpu.push(null);
        }
    } else if (type === 'gpu') {
        temperatureData.gpu.push(value);
        while (temperatureData.gpu.length < temperatureData.labels.length) {
            temperatureData.gpu.push(null);
        }
    }
    
    // Update the chart
    updateChart();
}

// Update the chart
function updateChart() {
    if (!temperatureChart) return;
    
    temperatureChart.data.labels = temperatureData.labels;
    temperatureChart.data.datasets[0].data = temperatureData.cpu;
    temperatureChart.data.datasets[1].data = temperatureData.gpu;
    temperatureChart.update();
}

// Listen for slider events
fanSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    sliderValue.textContent = `${value}%`;
});

fanSlider.addEventListener('change', (e) => {
    const value = parseInt(e.target.value);
    ipcRenderer.send('set-fan-speed', { speed: value });
    
    // Sync other sliders
    cpuFanSlider.value = value;
    gpuFanSlider.value = value;
    cpuSliderValue.textContent = `${value}%`;
    gpuSliderValue.textContent = `${value}%`;
});

cpuFanSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    cpuSliderValue.textContent = `${value}%`;
});

cpuFanSlider.addEventListener('change', (e) => {
    const value = parseInt(e.target.value);
    ipcRenderer.send('set-fan-speed', { fanId: 0, speed: value });
});

gpuFanSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    gpuSliderValue.textContent = `${value}%`;
});

gpuFanSlider.addEventListener('change', (e) => {
    const value = parseInt(e.target.value);
    ipcRenderer.send('set-fan-speed', { fanId: 1, speed: value });
});

// Listen for profile button events
profileButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const profile = btn.dataset.profile;
        
        // Update the UI
        profileButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update the current profile
        currentProfile = profile;
        
        // Send to the backend
        ipcRenderer.send('apply-profile', profile);
    });
});

// Listen for the mode change event
modeToggle.addEventListener('change', () => {
    isDynamicMode = modeToggle.checked;
    modeLabel.textContent = isDynamicMode ? 'Auto Mode' : 'Manual Mode';
    
    // Enable/disable the slider
    fanSlider.disabled = isDynamicMode;
    
    // Send to the backend
    ipcRenderer.send('set-mode', isDynamicMode);
});

// Control buttons
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

// Chart buttons
chartButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Update the UI
        chartButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update the time range
        chartTimeRange = parseInt(btn.dataset.time);
        
        // Reset chart data
        temperatureData = {
            labels: [],
            cpu: [],
            gpu: []
        };
    });
});

// Listen for fan data
ipcRenderer.on('fan-data', (event, data) => {
    // Always use real data
    console.log("Data received:", data);
    updateUI(data);
});

// Function to generate random values in a range
function getRandomValue(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Data simulation for development
let simulationEnabled = false;  // Disabled - use real data
let simulationInterval;

function startSimulation() {
    if (simulationEnabled) {
        if (simulationInterval) clearInterval(simulationInterval);
        
        simulationInterval = setInterval(() => {
            // Create simulated data
            const simulatedData = {
                cpu: {
                    temperature: getRandomValue(40, 65),
                    rpm: getRandomValue(2000, 7000),
                    speed: getRandomValue(30, 80)
                },
                gpu: {
                    temperature: getRandomValue(35, 60),
                    rpm: getRandomValue(1800, 6500),
                    speed: getRandomValue(30, 70)
                },
                fanSpeed: 50,
                status: isDynamicMode ? "Dynamic" : "Fixed",
                profile: currentProfile
            };
            
            updateUI(simulatedData);
        }, 1000);
    }
}

// Initialization function
function initialize() {
    // Initialize the chart
    initChart();
    
    // Reference fan animation elements
    cpuFanAnimation = document.getElementById('cpu-fan-animation');
    gpuFanAnimation = document.getElementById('gpu-fan-animation');
    
    // Add an event handler for the refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            // Add an animation class to the button
            refreshBtn.classList.add('fan-speed-change');
            setTimeout(() => refreshBtn.classList.remove('fan-speed-change'), 800);
            
            // Request a data update from the backend
            ipcRenderer.send('request-fan-status');
            
            // Animate the cards
            document.querySelectorAll('.card').forEach(card => {
                card.classList.add('fan-speed-change');
                setTimeout(() => card.classList.remove('fan-speed-change'), 800);
            });
        });
    }
}

// Run initialization on page load
document.addEventListener('DOMContentLoaded', initialize); 