#include <iostream>
#include <stdlib.h>
#include<vector>
#include<string>
using namespace std;
int main(){
    int choice;
    cout<<"==================================================";
    cout<<"Welcome to SpendWise! Please Select a choice\n";
    cout<<"==================================================";

    do{
        cout<<"1.Add Expense\n";
        cout<<"2.View Expense\n";
        cout<<"3.Calculate Total Expense\n";
        cout<<"4.Delete Expense\n";
        cout<<"5.Exit\n";

        cout<<"Enter your choice here: ";
        cin>>choice;

        switch(choice){
            case 1:
                cout<<"Adding Expense\n";break;
            case 2:
                cout<<"Viewing Expense\n";break;
            case 3:
                cout<<"Calculating Total Expense\n";break;
            case 4:
                cout<<"Deleting Expense\n";break;
            case 5:
                cout<<"Thank You For Using SpendWise!\n";break;
            default:
                cout<<"Please Enter Valid Choice\n";
        }
    }while(choice!=5);
    return 0;
}