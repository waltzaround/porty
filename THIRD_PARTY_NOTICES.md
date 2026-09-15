# WhatCable

Porty's macOS power and cable decoder is adapted from [WhatCable](https://github.com/darrylmorley/whatcable), commit `3810eda84e415ad76616d361bb7c4d4126fd1024`.

Copyright (c) 2026 Darryl Morley. Used under the MIT licence; the full licence is included in `licenses/WhatCable.txt`.

Adapted source modules: `WhatCableCore/PD/USBPDVDO.swift`, `WhatCableCore/PD/USBPDSOP.swift`, `WhatCableCore/PD/AppleAccessoryIdentity.swift`, `WhatCableCore/Cable/CableClassification.swift`, `WhatCableCore/Output/PortSummary.swift`, and `WhatCableDarwinBackend/Watchers/{PowerSourceWatcher,USBPDSOPWatcher}.swift`.

Changes: translated the relevant pure parsing logic into TypeScript, read from Porty's per-port ioreg snapshots, preserve VDO positions on malformed data, label the ambiguous speed encoding explicitly, leave default/reserved cable-current ratings unknown, and display only selected properties. Porty does not include WhatCable's proprietary plugins, telemetry, cable database, updater, live power-metering or native notification service.
