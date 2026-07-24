# @naija-agent/logistics

## 1. Overview and Purpose
The `@naija-agent/logistics` package is a dedicated, lightweight module within the `naija-agent-core` project responsible for Logistics and Delivery Management. Its primary goal is to abstract delivery and shipping operations into a single, unified interface (`LogisticsProvider`), enabling the agent to easily fetch shipping rates and track packages across different underlying delivery networks.

## 2. Key Dependencies
- **`axios`** (`^1.6.0`): Used for making HTTP requests to external logistics APIs (specifically Terminal Africa).
- **`typescript`** (`^5.0.0`): Dev dependency for compiling the strictly-typed source code.

## 3. Core Integrations & Logic
The package is designed around a core `LogisticsProvider` interface that requires two main methods:
- `getRates(params)`: Retrieves available shipping rates, including provider name, service type, amount, and delivery time.
- `track(trackingNumber)`: Fetches the real-time status of a delivery.

### Integrations:
- **Terminal Africa (`TerminalAfricaProvider`)**: The primary production integration. It connects to the `https://api.terminal.africa/v1` endpoint using an API key. It fetches live rates and intelligently maps Terminal Africa's tracking statuses to a standard internal format (`pending`, `in_transit`, `delivered`, `failed`).
- **Mock Provider (`MockLogisticsProvider`)**: A built-in fallback and testing provider. It returns dummy rates (e.g., GIGL Regular, DHL Express) and a dummy `in_transit` tracking status without making any network requests.
- **Factory Pattern**: The package exports a `getLogisticsProvider(type, apiKey)` function to seamlessly switch between the `terminal` provider for production and the `mock` provider for testing/development.

## 4. Key Modules / Directory Structure
- **`package.json`** / **`tsconfig.json`**: Standard configuration files defining the build script (`tsc`), dependencies, and package metadata.
- **`src/index.ts`**: The main entry point. It defines the core data interfaces (`ShippingRate`, `TrackingStatus`, `LogisticsProvider`), implements the `MockLogisticsProvider`, and exposes the `getLogisticsProvider` factory method.
- **`src/terminal.ts`**: Contains the `TerminalAfricaProvider` class. It encapsulates the `axios` HTTP calls to the Terminal Africa API, handles error catching, and maps API responses to the core TypeScript interfaces.
- **`dist/`** (after build): The output directory for compiled JavaScript code (generated upon running the build command).
