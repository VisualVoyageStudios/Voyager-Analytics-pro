import MetaTrader5 as mt5

if not mt5.initialize():

    print("Initialize failed")

else:

    account = mt5.account_info()

    print(account)

    mt5.shutdown()