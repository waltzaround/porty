#import <Foundation/Foundation.h>
#import <IOKit/IOKitLib.h>
#import <IOKit/ps/IOPowerSources.h>
#import <CoreGraphics/CoreGraphics.h>

// Read-only notifications. No input capture, screen capture, device opening,
// serial numbers, or changes to macOS accessory authorization.
static BOOL armed = NO;
static NSMutableDictionary<NSString *, NSString *> *names;
static void Emit(NSDictionary *event) {
    @autoreleasepool {
        NSData *json = [NSJSONSerialization dataWithJSONObject:event options:0 error:nil];
        if (json) { fwrite(json.bytes, 1, json.length, stdout); fputc('\n', stdout); fflush(stdout); }
    }
}
static void Devices(void *context, io_iterator_t iterator) {
    @autoreleasepool {
        io_service_t service;
        BOOL connected = context != NULL;
        while ((service = IOIteratorNext(iterator))) {
            uint64_t registryID = 0;
            if (IORegistryEntryGetRegistryEntryID(service, &registryID) == KERN_SUCCESS) {
                NSString *key = [NSString stringWithFormat:@"usb-%llu", registryID];
                CFTypeRef value = IORegistryEntryCreateCFProperty(service, CFSTR("USB Product Name"), kCFAllocatorDefault, 0);
                NSString *name = value && CFGetTypeID(value) == CFStringGetTypeID() ? [(__bridge NSString *)value copy] : names[key];
                if (value) CFRelease(value);
                if (!name.length) name = @"USB device";
                if (name.length > 160) name = [name substringToIndex:160];
                if (connected) names[key] = name;
                if (armed) Emit(@{@"kind": @"usb", @"action": connected ? @"connected" : @"disconnected", @"id": key, @"name": name});
                if (!connected) [names removeObjectForKey:key];
            }
            IOObjectRelease(service);
        }
    }
}
static void Display(CGDirectDisplayID display, CGDisplayChangeSummaryFlags flags, void *context) {
    if (!armed || (flags & kCGDisplayBeginConfigurationFlag)) return;
    NSString *action = flags & kCGDisplayRemoveFlag ? @"disconnected" : flags & kCGDisplayAddFlag ? @"connected" : flags & (kCGDisplaySetModeFlag | kCGDisplayEnabledFlag | kCGDisplayDisabledFlag) ? @"changed" : nil;
    if (action) Emit(@{@"kind": @"display", @"action": action, @"id": [NSString stringWithFormat:@"mac-display-%u", display], @"name": @"Display"});
}
static void Power(void *context) { if (armed) Emit(@{@"kind": @"power"}); }
int main(void) {
    @autoreleasepool {
        names = [NSMutableDictionary dictionary];
        IONotificationPortRef notifications = IONotificationPortCreate(kIOMainPortDefault);
        if (!notifications) return 2;
        CFRunLoopAddSource(CFRunLoopGetMain(), IONotificationPortGetRunLoopSource(notifications), kCFRunLoopDefaultMode);
        io_iterator_t arrivals = 0, removals = 0;
        kern_return_t added = IOServiceAddMatchingNotification(notifications, kIOFirstMatchNotification, IOServiceMatching("IOUSBHostDevice"), Devices, (void *)1, &arrivals);
        if (added == KERN_SUCCESS) Devices((void *)1, arrivals);
        kern_return_t removed = IOServiceAddMatchingNotification(notifications, kIOTerminatedNotification, IOServiceMatching("IOUSBHostDevice"), Devices, NULL, &removals);
        if (removed == KERN_SUCCESS) Devices(NULL, removals);
        BOOL displays = CGDisplayRegisterReconfigurationCallback(Display, NULL) == kCGErrorSuccess;
        CFRunLoopSourceRef power = IOPSNotificationCreateRunLoopSource(Power, NULL);
        if (power) CFRunLoopAddSource(CFRunLoopGetMain(), power, kCFRunLoopDefaultMode);
        armed = YES;
        Emit(@{@"kind": @"ready", @"usb": added == KERN_SUCCESS && removed == KERN_SUCCESS ? @YES : @NO, @"displays": displays ? @YES : @NO});
        CFRunLoopRun();
        if (power) CFRelease(power);
        if (displays) CGDisplayRemoveReconfigurationCallback(Display, NULL);
        if (arrivals) IOObjectRelease(arrivals);
        if (removals) IOObjectRelease(removals);
        IONotificationPortDestroy(notifications);
    }
    return 0;
}
